/**
 * route-builder.js
 * Логика построения текстового маршрута между двумя станциями метро,
 * включая маршруты с пересадками между линиями.
 *
 * У каждой станции вход и выход хранятся в station.vestibules — массиве вестибюлей
 * ({ id, name, entrance: {steps}, exit: {steps} }). У большинства станций он состоит из
 * одного элемента и выбирается автоматически; если вестибюлей несколько —
 * конкретный id должен быть явно передан вызывающим кодом (никакой вестибюль не выбирается
 * молча по умолчанию — какой физический вход/выход выбран, влияет на итоговый текст маршрута).
 * platform остаётся общим для станции — он не зависит от того, через какой вестибюль вошли.
 *
 * Пересадки хранятся в station.transfers — массиве { to, steps }, где to — id станции
 * на другой линии, физически связанной переходом, а steps — шаги перехода (может быть
 * пустым массивом, если текст ещё не описан — сам факт пересадки в маршруте всё равно
 * покажется, просто без текста шагов).
 *
 * Формат шага внутри вестибюля (entrance.steps / exit.steps), в platform.steps
 * и в transfers[].steps:
 *   { "text": "..." }                                — безусловный шаг
 *   { "when": { "arrival_from": "Парнас" }, "text": "..." } — шаг только для этого условия
 *
 * Маршрут строится не только в пределах одной линии: между станциями ищется путь
 * по графу, где рёбра — это "соседняя станция на той же линии" и "пересадочная связь"
 * (из station.transfers). Поиск пути минимизирует СНАЧАЛА число пересадок, и только
 * потом число станций (см. findPath) — иначе движок может предпочесть лишнюю пересадку
 * ради пары сэкономленных остановок, что для незрячего пассажира почти всегда хуже.
 * Найденный путь разбивается на последовательность сегментов "поездка по линии" /
 * "пересадка" — каждый сегмент интерфейс показывает под своим заголовком (см. renderRoute
 * в app.js), даже если у сегмента нет текста шагов.
 */

/**
 * Ошибка построения маршрута с текстом, понятным пользователю
 * (её можно показывать прямо в интерфейсе).
 */
class RouteBuildError extends Error {}

/**
 * Проверяет, подходит ли шаг под текущий контекст маршрута.
 *
 * @param {{when?: Object, text: string}} step
 * @param {Object} context - например { arrival_from: "Парнас" }
 * @returns {boolean}
 */
function stepMatches(step, context) {
  if (!step.when) {
    return true; // безусловный шаг — показываем всегда
  }
  return Object.entries(step.when).every(([key, value]) => context[key] === value);
}

/**
 * Отбирает шаги, подходящие под контекст, и возвращает их текст вместе с признаком,
 * был ли шаг условным. Если у станции вообще нет шагов для этого блока (нет данных),
 * возвращается пустой массив — интерфейс должен показать заголовок раздела всё равно,
 * просто без содержимого (см. appendStepsOrNote в app.js).
 *
 * @param {Array<Object>|undefined} steps
 * @param {Object} context
 * @returns {Array<{text: string, conditional: boolean}>}
 */
function resolveSteps(steps, context) {
  if (!steps || steps.length === 0) {
    return [];
  }
  return steps
    .filter((step) => stepMatches(step, context))
    .map((step) => ({ text: step.text, conditional: Boolean(step.when) }));
}

/**
 * Находит нужный вестибюль станции. Если вестибюль один — он возвращается всегда,
 * независимо от переданного vestibuleId (его можно вообще не указывать для таких станций).
 * Если вестибюлей несколько, а vestibuleId не передан или не найден — это ошибка:
 * выбор входа/выхода у таких станций должен быть явным действием пользователя
 * (это не связано с отсутствием текста шагов — без выбора физически непонятно, о каком
 * вестибюле вообще идёт речь).
 *
 * @param {Object} station
 * @param {string|undefined} vestibuleId
 * @returns {Object} вестибюль со структурой { id, name, entrance, exit }
 * @throws {RouteBuildError}
 */
function resolveVestibule(station, vestibuleId) {
  const vestibules = station.vestibules;
  if (!vestibules || vestibules.length === 0) {
    // Нет вообще никаких данных о вестибюлях — возвращаем пустую заглушку вместо ошибки,
    // чтобы маршрут всё равно построился (см. общее требование показывать полный скелет
    // маршрута даже без данных).
    return { id: null, name: station.name, entrance: { steps: [] }, exit: { steps: [] } };
  }
  if (vestibules.length === 1) {
    return vestibules[0];
  }
  const found = vestibules.find((v) => v.id === vestibuleId);
  if (!found) {
    throw new RouteBuildError(`У станции «${station.name}» несколько входов/выходов — выберите нужный в соответствующем поле.`);
  }
  return found;
}

/**
 * Строит граф станций: рёбра "соседняя станция на той же линии" (type: 'line')
 * и "пересадочная связь" (type: 'transfer', из station.transfers).
 *
 * @param {Object} stations - словарь station_id -> станция
 * @param {Object} lines - словарь line_id -> линия
 * @returns {Map<string, Array<{to: string, type: 'line'|'transfer', lineId?: string}>>}
 */
function buildGraph(stations, lines) {
  const graph = new Map();

  function addEdge(fromId, toId, edge) {
    if (!graph.has(fromId)) {
      graph.set(fromId, []);
    }
    graph.get(fromId).push({ to: toId, ...edge });
  }

  for (const line of Object.values(lines)) {
    const order = line.stations;
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      addEdge(a, b, { type: 'line', lineId: line.id });
      addEdge(b, a, { type: 'line', lineId: line.id });
    }
  }

  for (const station of Object.values(stations)) {
    const transfers = station.transfers || [];
    for (const transfer of transfers) {
      addEdge(station.id, transfer.to, { type: 'transfer' });
    }
  }

  return graph;
}

/**
 * Ищет лучший путь между двумя станциями по графу — взвешенный поиск (алгоритм Дейкстры),
 * а не простой BFS. Пересадочное ребро стоит намного дороже ребра "соседняя станция на
 * линии" (TRANSFER_WEIGHT против 1) — это сделано НАМЕРЕННО: для незрячего пассажира
 * проехать на пару станций больше в вагоне намного безопаснее и проще, чем сделать лишнюю
 * пересадку только ради того, чтобы сократить пару остановок (простой BFS без весов именно
 * так и делал — например, для Владимирская → Пионерская предпочитал путь через две
 * пересадки (1↔3, 3↔2) вместо одной через Технологический институт-1/2, просто потому что
 * так на бумаге на одну "станцию графа" меньше). Граф маленький (75 станций), поэтому
 * реализация намеренно простая: O(n²) поиск минимума без очереди с приоритетом, вместо
 * неё вполне хватило бы наивного линейного перебора.
 *
 * @param {Map} graph
 * @param {string} fromId
 * @param {string} toId
 * @returns {{path: string[], edges: Array<{type: 'line'|'transfer', lineId?: string}>}|null}
 */
function findPath(graph, fromId, toId) {
  if (fromId === toId) {
    return { path: [fromId], edges: [] };
  }

  const TRANSFER_WEIGHT = 1000; // число пересадок важнее числа станций (в метро СПб не
  // наберётся сотни остановок на одной поездке, поэтому этот вес надёжно доминирует)
  const dist = new Map([[fromId, 0]]);
  const visited = new Set();
  // stationId -> { prev: stationId, edge: {type, lineId?} }
  const prev = new Map();

  while (true) {
    let current = null;
    let currentDist = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < currentDist) {
        current = node;
        currentDist = d;
      }
    }
    if (current === null || current === toId) break;
    visited.add(current);

    const neighbors = graph.get(current) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const weight = edge.type === 'transfer' ? TRANSFER_WEIGHT : 1;
      const newDist = currentDist + weight;
      if (newDist < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newDist);
        prev.set(edge.to, { prev: current, edge });
      }
    }
  }

  if (!prev.has(toId)) {
    return null; // пути нет (станции не связаны в графе)
  }

  // Восстанавливаем путь от конца к началу.
  const path = [toId];
  const edges = [];
  let node = toId;
  while (node !== fromId) {
    const entry = prev.get(node);
    path.unshift(entry.prev);
    edges.unshift({ type: entry.edge.type, lineId: entry.edge.lineId });
    node = entry.prev;
  }
  return { path, edges };
}

/**
 * Вычисляет для одной поездки по линии направление, названия конечных, сторону
 * посадки и "с какой стороны прибыл поезд" — используется и как контекст для
 * resolveSteps (arrival_from), и напрямую в тексте маршрута.
 *
 * Логика направления (не изменилась с версии без пересадок):
 *  - находим станцию с order === 1 (первую в line.stations) — это терминал;
 *  - у терминала в platform.directions ровно одна запись — её destination
 *    и есть название "дальнего" конца линии (например "Купчино");
 *  - название самого терминала (например "Парнас") — это "ближний" конец;
 *  - если индекс станции Б в line.stations больше индекса станции А —
 *    едем в сторону дальнего конца, иначе — в сторону терминала.
 *
 * Если у терминала линии нет данных (например сама станция-терминал ещё
 * "no_data" — так было с Девяткино на линии 1), это НЕ блокирует маршрут: по тому же
 * принципу, что и с текстом шагов — просто destinationLabel/arrivalFrom оказываются null,
 * и тогда фраза о стороне посадки в renderRoute() просто не выводится (boardingSide тоже
 * окажется null, т.к. искать сторону по destination === null нечем), а условные шаги
 * (when: arrival_from) просто не попадают в resolveSteps — точно так же, как если бы у станции
 * просто не было ни одного шага. Направление поездки (movingForward) при этом всё
 * равно определяется корректно — оно зависит только от порядка станций в line.stations,
 * а не от данных терминала.
 *
 * @throws {RouteBuildError} только при структурных проблемах с данными (линия не найдена,
 * станция не входит в line.stations) — отсутствие текста/направления у терминала
 * к этим проблемам не относится.
 */
function computeLineContext(lineId, fromId, toId, stations, lines) {
  const line = lines[lineId];
  if (!line) {
    throw new RouteBuildError('Линия для выбранных станций не найдена в данных.');
  }

  const stationOrder = line.stations;
  const indexFrom = stationOrder.indexOf(fromId);
  const indexTo = stationOrder.indexOf(toId);

  if (indexFrom === -1 || indexTo === -1) {
    throw new RouteBuildError('Не удалось определить порядок станций на линии.');
  }

  const terminalId = stationOrder[0];
  const terminalStation = stations[terminalId];

  // labelNear берётся из имени станции — оно есть всегда, даже у "no_data". А вот labelFar
  // берётся из platform.directions терминала, которых у "no_data"-терминала нет —
  // в этом случае labelFar остаётся null, и дальше по цепочке всё корректно сводится к null.
  const labelNear = terminalStation ? terminalStation.name : null;
  const labelFar =
    terminalStation && terminalStation.platform.directions && terminalStation.platform.directions.length > 0
      ? terminalStation.platform.directions[0].destination
      : null;

  const movingForward = indexTo > indexFrom;
  const destinationLabel = movingForward ? labelFar : labelNear;
  const arrivalFrom = movingForward ? labelNear : labelFar;

  const from = stations[fromId];
  const boardingEntry = destinationLabel
    ? (from.platform.directions || []).find((d) => d.destination === destinationLabel)
    : undefined;
  const boardingSide = boardingEntry ? boardingEntry.side : null;

  return { destinationLabel, arrivalFrom, boardingSide };
}

/**
 * Достаёт текст шагов перехода со станции fromStation на станцию toId
 * (ищет соответствующую запись в station.transfers). Пустой массив, если
 * шаги ещё не описаны — это нормально, раздел "Переход" всё равно покажется.
 */
function getTransferSteps(fromStation, toId) {
  const transfers = fromStation.transfers || [];
  const entry = transfers.find((t) => t.to === toId);
  return resolveSteps(entry ? entry.steps : [], {});
}

/**
 * Строит маршрут между двумя станциями — в пределах одной линии или с пересадками.
 *
 * @param {string} fromId - id станции отправления
 * @param {string} toId - id станции назначения
 * @param {string|undefined} fromVestibuleId - id вестибюля для входа (нужен, только если у станции несколько вестибюлей)
 * @param {string|undefined} toVestibuleId - id вестибюля для выхода (аналогично)
 * @param {Object} stations - словарь station_id -> станция (из loadMetroData)
 * @param {Object} lines - словарь line_id -> линия (из loadMetroData)
 * @returns {{
 *   fromName: string,
 *   toName: string,
 *   entranceSteps: Array<{text: string, conditional: boolean}>,
 *   exitSteps: Array<{text: string, conditional: boolean}>,
 *   segments: Array<Object>
 * }}
 * @throws {RouteBuildError} если маршрут построить нельзя
 */
function buildRoute(fromId, toId, fromVestibuleId, toVestibuleId, stations, lines) {
  if (fromId === toId) {
    throw new RouteBuildError('Станция отправления и станция назначения совпадают. Выберите другую станцию.');
  }

  const from = stations[fromId];
  const to = stations[toId];

  if (!from || !to) {
    throw new RouteBuildError('Одна из выбранных станций не найдена в данных.');
  }

  const graph = buildGraph(stations, lines);
  const found = findPath(graph, fromId, toId);
  if (!found) {
    throw new RouteBuildError(`Не удалось найти путь между станциями «${from.name}» и «${to.name}» — возможно, в данных не хватает связей между линиями.`);
  }

  const { path, edges } = found;

  // Разбиваем путь на сегменты "поездка по линии" и "пересадка".
  // rideBuffer копит подряд идущие узлы одной поездки; если перед пересадкой
  // в нём меньше двух станций — поездки не было (например, тройной узел
  // "Сенная площадь"/"Спасская"/"Садовая", где можно перейти сразу дальше
  // без посадки в поезд), и сегмент "поездка" для него не создаётся.
  const segments = [];
  let rideBuffer = [path[0]];
  let rideLineId = null;

  function flushRide() {
    if (rideBuffer.length > 1) {
      segments.push({
        type: 'ride',
        lineId: rideLineId,
        fromId: rideBuffer[0],
        toId: rideBuffer[rideBuffer.length - 1],
      });
    }
    rideBuffer = [];
    rideLineId = null;
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const nextNode = path[i + 1];

    if (edge.type === 'line') {
      if (rideBuffer.length === 0) {
        rideBuffer = [path[i]];
        rideLineId = edge.lineId;
      } else if (rideLineId === null) {
        rideLineId = edge.lineId;
      }
      rideBuffer.push(nextNode);
    } else {
      // edge.type === 'transfer'
      flushRide();
      segments.push({
        type: 'transfer',
        fromId: path[i],
        toId: nextNode,
      });
      rideBuffer = [nextNode];
      rideLineId = null;
    }
  }
  flushRide();

  // Дополняем каждый сегмент "поездка" направлением/стороной посадки/шагами платформы.
  for (const segment of segments) {
    if (segment.type !== 'ride') continue;

    const ctx = computeLineContext(segment.lineId, segment.fromId, segment.toId, stations, lines);
    segment.destinationLabel = ctx.destinationLabel;
    segment.arrivalFrom = ctx.arrivalFrom;
    segment.boardingSide = ctx.boardingSide;

    const fromStation = stations[segment.fromId];
    const toStation = stations[segment.toId];
    segment.fromName = fromStation.name;
    segment.toName = toStation.name;

    const boardingContext = { arrival_from: ctx.arrivalFrom };
    segment.platformSteps = resolveSteps(fromStation.platform.steps, boardingContext);
    // arrivalPlatformSteps ("сойдите с платформы") нужны только если после этого сегмента
    // идёт пересадка, а не финальный выход — но считаем их всегда, решает renderRoute.
    segment.arrivalPlatformSteps = resolveSteps(toStation.platform.steps, boardingContext);
  }

  for (const segment of segments) {
    if (segment.type !== 'transfer') continue;
    const fromStation = stations[segment.fromId];
    const toStation = stations[segment.toId];
    segment.fromName = fromStation.name;
    segment.toName = toStation.name;
    segment.steps = getTransferSteps(fromStation, segment.toId);
  }

  const fromVestibule = resolveVestibule(from, fromVestibuleId);
  const toVestibule = resolveVestibule(to, toVestibuleId);

  // Шаги выхода (exit.steps) могут зависеть от того, с какой стороны прибыл поезд
  // (when: arrival_from) — этот контекст берём из ПОСЛЕДНЕГО сегмента-поездки маршрута.
  // Если маршрут заканчивается сразу пересадкой без финальной поездки (вырожденный
  // случай — например, соседние станции тройного узла), условных шагов выхода просто
  // не будет: resolveSteps с пустым контекстом отфильтрует все шаги с "when".
  const lastRideSegment = [...segments].reverse().find((s) => s.type === 'ride');
  const exitContext = lastRideSegment ? { arrival_from: lastRideSegment.arrivalFrom } : {};

  return {
    fromName: from.name,
    toName: to.name,
    entranceSteps: resolveSteps(fromVestibule.entrance.steps, {}),
    exitSteps: resolveSteps(toVestibule.exit.steps, exitContext),
    segments,
  };
}
