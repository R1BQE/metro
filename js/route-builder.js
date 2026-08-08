/**
 * route-builder.js
 * Логика построения текстового маршрута между двумя станциями одной линии.
 *
 * Формат шага в данных станции (entrance.steps / platform.steps / exit.steps):
 *   { "text": "..." }                                — безусловный шаг
 *   { "when": { "arrival_from": "Парнас" }, "text": "..." } — шаг только для этого условия
 *
 * Ключи внутри "when" не жёстко заданы: сейчас используется только
 * "arrival_from" (с какой стороны линии прибыл поезд), но при добавлении
 * пересадок можно будет добавить, например, "transfer_to" — движок ниже
 * менять не придётся, т.к. stepMatches сравнивает произвольный набор ключей.
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
 * Отбирает шаги, подходящие под контекст, и возвращает их текст вместе с признаком, был ли шаг условным — это нужно интерфейсу, чтобы знать, что именно этот шаг — тот самый условный поворот на выходе (а не, например, обычный первый шаг у терминальной станции, где такого условия нет).
 *
 * @param {Array<Object>} steps
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
 * Строит маршрут между двумя станциями в пределах одной линии.
 *
 * Логика направления:
 *  - находим станцию с order === 1 (первую в line.stations) — это терминал;
 *  - у терминала в platform.directions ровно одна запись — её destination
 *    и есть название "дальнего" конца линии (например "Купчино");
 *  - название самого терминала (например "Парнас") — это "ближний" конец;
 *  - если индекс станции Б в line.stations больше индекса станции А —
 *    едем в сторону дальнего конца, иначе — в сторону терминала.
 *
 * Результат разбит по секциям (вход А / платформа А / платформа Б / выход Б),
 * чтобы интерфейс мог показать их под отдельными заголовками, а не единым
 * плоским списком.
 *
 * @param {string} fromId - id станции отправления
 * @param {string} toId - id станции назначения
 * @param {Object} stations - словарь station_id -> станция (из loadMetroData)
 * @param {Object} lines - словарь line_id -> линия (из loadMetroData)
 * @returns {{
 *   fromName: string,
 *   toName: string,
 *   entranceSteps: Array<{text: string, conditional: boolean}>,
 *   fromPlatformSteps: Array<{text: string, conditional: boolean}>,
 *   toPlatformSteps: Array<{text: string, conditional: boolean}>,
 *   exitSteps: Array<{text: string, conditional: boolean}>,
 *   boardingSide: string|null,
 *   arrivalFrom: string,
 *   destinationLabel: string
 * }}
 * @throws {RouteBuildError} если маршрут построить нельзя
 */
function buildRoute(fromId, toId, stations, lines) {
  if (fromId === toId) {
    throw new RouteBuildError('Станция отправления и станция назначения совпадают. Выберите другую станцию.');
  }

  const from = stations[fromId];
  const to = stations[toId];

  if (!from || !to) {
    throw new RouteBuildError('Одна из выбранных станций не найдена в данных.');
  }

  if (from.status === 'no_data') {
    throw new RouteBuildError(`Для станции «${from.name}» пока нет данных.`);
  }
  if (to.status === 'no_data') {
    throw new RouteBuildError(`Для станции «${to.name}» пока нет данных.`);
  }

  if (from.line_id !== to.line_id) {
    throw new RouteBuildError(
      'В текущей версии маршруты строятся только в пределах одной линии, без пересадок.'
    );
  }

  const line = lines[from.line_id];
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
  if (!terminalStation || !terminalStation.platform.directions || terminalStation.platform.directions.length === 0) {
    throw new RouteBuildError('Не удалось определить направления линии: нет данных по конечной станции.');
  }

  const labelFar = terminalStation.platform.directions[0].destination; // например "Купчино"
  const labelNear = terminalStation.name; // например "Парнас"

  const movingForward = indexTo > indexFrom;
  const destinationLabel = movingForward ? labelFar : labelNear;
  const arrivalFrom = movingForward ? labelNear : labelFar;

  const context = { arrival_from: arrivalFrom };

  const boardingEntry = (from.platform.directions || []).find((d) => d.destination === destinationLabel);
  const boardingSide = boardingEntry ? boardingEntry.side : null;

  return {
    fromName: from.name,
    toName: to.name,
    entranceSteps: resolveSteps(from.entrance.steps, context),
    fromPlatformSteps: resolveSteps(from.platform.steps, context),
    toPlatformSteps: resolveSteps(to.platform.steps, context),
    exitSteps: resolveSteps(to.exit.steps, context),
    boardingSide,
    arrivalFrom,
    destinationLabel,
  };
}
