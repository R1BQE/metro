/**
 * app.js
 * Связывает загрузку данных, построение маршрута (route-builder.js)
 * и интерфейс index.html.
 */

// Универсальная фраза-переход "сядьте в поезд", одинаковая для любой станции,
// поэтому не хранится в данных станции, а задаётся здесь как константа интерфейса.
const BOARD_TRAIN_STEP = 'Дождитесь прибытия поезда и войдите в вагон.';

(async function () {
  const fromInput = document.getElementById('station-from-input');
  const fromSelect = document.getElementById('station-from-select');
  const fromEntranceRow = document.getElementById('station-from-entrance-row');
  const fromEntranceSelect = document.getElementById('station-from-entrance-select');

  const toInput = document.getElementById('station-to-input');
  const toSelect = document.getElementById('station-to-select');
  const toExitRow = document.getElementById('station-to-exit-row');
  const toExitSelect = document.getElementById('station-to-exit-select');

  const swapButton = document.getElementById('swap-btn');
  const form = document.getElementById('route-form');
  const statusRegion = document.getElementById('status');
  const resultRegion = document.getElementById('result');

  let stations = {};
  let lines = {};
  let fromCombobox = null;
  let toCombobox = null;

  /**
   * Короткое сообщение о состоянии (загрузка, ошибка, короткое подтверждение).
   * Это единственный элемент с aria-live на странице — озвучивается NVDA
   * целиком, поэтому здесь всегда должен быть только один короткий факт,
   * а не весь маршрут.
   *
   * Сначала текст очищается, и только потом (следующим тиком) ставится новый.
   * Это обязательно: если два раза подряд задать в aria-live-регионе один и тот же
   * текст (например, «Маршрут построен.» после повторного построения), браузер не
   * увидит изменения в дереве доступности и НЕ пошлёт событие NVDA — сообщение
   * молча не озвучится. Очистка гарантирует реальное изменение текста при каждом вызове.
   */
  function setStatus(message) {
    statusRegion.textContent = '';
    window.setTimeout(() => {
      statusRegion.textContent = message;
    }, 100);
  }

  /**
   * Показывает или скрывает поле выбора вестибюля (вход у станции отправления,
   * выход у станции назначения) в зависимости от того, сколько вестибюлей у
   * выбранной станции. Если он один — поле скрыто и не участвует в построении
   * маршрута (resolveVestibule в route-builder.js сам возьмёт единственный
   * вариант). Если несколько — поле показывается пустым, без выбора по
   * умолчанию: какой физический вход/выход выбран, влияет на итоговый текст
   * маршрута, поэтому выбор обязан быть явным действием пользователя.
   */
  function syncVestibuleRow(stationId, row, select) {
    const station = stationId ? stations[stationId] : null;
    const vestibules = station ? station.vestibules : null;

    if (!vestibules || vestibules.length <= 1) {
      row.hidden = true;
      select.innerHTML = '';
      return;
    }

    row.hidden = false;
    populateVestibuleSelect(select, vestibules);
  }

  /**
   * Строит список станций для комбобоксов и создаёт оба комбобокса.
   * Список включает станции ВСЕХ линий из lines.json (порядок в списке тот же,
   * что и в самом lines.json: сначала все станции линии 1 по порядку, затем линии 2 и т.д.).
   * Станции со статусом "no_data" остаются в списке, но с пометкой "(данных
   * пока нет)" — если пользователь всё же выберет такую станцию, buildRoute()
   * сам вернёт понятную ошибку при построении маршрута. А так как
   * buildRoute() требует, чтобы станции отправления и назначения были на одной
   * линии (маршруты без пересадок), в метку к каждому названию добавлен
   * номер линии и её цвет («— линия N. (Цвет)»), чтобы станции с одинаковым
   * или похожим названием на разных линиях было видно различить до выбора,
   * а не только после ошибки при попытке построить маршрут. Цвет берётся из
   * line.name в lines.json (формат «Линия N — цвет»), а не хранится отдельно,
   * чтобы не было двух источников истины.
   */
  function initPickers() {
    const allLines = Object.values(lines);
    if (allLines.length === 0) {
      setStatus('В данных не найдено ни одной линии.');
      return;
    }

    const options = [];
    for (const line of allLines) {
      const lineNumber = line.id.replace(/^line/, '');
      const colorMatch = line.name.match(/—\s*(.+)$/);
      const colorLabel = colorMatch
        ? colorMatch[1].trim().replace(/^./, (c) => c.toUpperCase())
        : '';
      for (const stationId of line.stations) {
        const station = stations[stationId];
        if (!station) continue;
        const suffix = station.status === 'no_data' ? ' (данных пока нет)' : '';
        const colorSuffix = colorLabel ? ` (${colorLabel})` : '';
        options.push({
          id: station.id,
          label: `${station.name} — линия ${lineNumber}.${colorSuffix}${suffix}`,
        });
      }
    }

    fromCombobox = createStationPicker({
      input: fromInput,
      select: fromSelect,
      options,
      onSelect: (id) => syncVestibuleRow(id, fromEntranceRow, fromEntranceSelect),
    });

    toCombobox = createStationPicker({
      input: toInput,
      select: toSelect,
      options,
      onSelect: (id) => syncVestibuleRow(id, toExitRow, toExitSelect),
    });

    // По умолчанию выбираем две разные станции, чтобы select сразу содержал валидный
    // выбор и форма была готова к отправке. Текстовые поля при этом нарочно
    // остаются пустыми (updateInput: false) — пользователь должен либо сам начать
    // печатать часть названия станции, либо явно выбрать вариант из списка сам —
    // название станции, подставленное без явного действия, вводило бы в заблуждение.
    if (options.length > 1) {
      fromCombobox.setSelectedId(options[0].id, { updateInput: false });
      toCombobox.setSelectedId(options[1].id, { updateInput: false });
    }
  }

  /** Показывает сообщение об ошибке и очищает предыдущий результат. */
  function renderError(message) {
    resultRegion.innerHTML = '';
    setStatus(message);
  }

  /** Переводит код стороны платформы ("left"/"right") в текст "по ходу движения". */
  function sideToText(side) {
    if (side === 'left') return 'с левой стороны по ходу движения';
    if (side === 'right') return 'с правой стороны по ходу движения';
    return null;
  }

  /** Делает первую букву строки строчной — нужно, чтобы вставить текст шага после приставки вроде «После выхода из поезда …». */
  function lowerFirst(text) {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  /** Добавляет в контейнер заголовок h3. */
  function appendHeading(container, text) {
    const h3 = document.createElement('h3');
    h3.textContent = text;
    container.appendChild(h3);
  }

  /** Добавляет в контейнер один шаг маршрута как обычный абзац (без списков). */
  function appendStep(container, text) {
    const p = document.createElement('p');
    p.textContent = text;
    container.appendChild(p);
  }

  /**
   * Отрисовывает построенный маршрут в области результата.
   * #result НЕ является aria-live регионом специально: если озвучивать весь
   * этот блок при появлении, экранный читалка прочитает целиком весь маршрут
   * сразу после нажатия кнопки. Вместо этого мы даём короткое уведомление
   * через #status, а сам текст маршрута пользователь читает сам, когда готов.
   */
  function renderRoute(route) {
    resultRegion.innerHTML = '';

    const totalSteps =
      route.entranceSteps.length +
      route.fromPlatformSteps.length +
      1 + // BOARD_TRAIN_STEP
      route.exitSteps.length;

    const heading = document.createElement('h2');
    heading.textContent = `Маршрут: ${route.fromName} → ${route.toName}`;
    resultRegion.appendChild(heading);

    const meta = document.createElement('p');
    meta.className = 'route-meta';
    meta.textContent = `Шагов: ${totalSteps}`;
    resultRegion.appendChild(meta);

    appendHeading(resultRegion, `Вход: ${route.fromName}`);
    route.entranceSteps.forEach((step) => appendStep(resultRegion, step.text));

    appendHeading(resultRegion, `На платформе: ${route.fromName}`);
    const boardingSideText = sideToText(route.boardingSide);
    if (boardingSideText) {
      appendStep(resultRegion, `Поезда в направлении «${route.destinationLabel}» отправляются ${boardingSideText}.`);
    }
    route.fromPlatformSteps.forEach((step) => appendStep(resultRegion, step.text));
    appendStep(resultRegion, BOARD_TRAIN_STEP);

    // Секция «На платформе: {Б}» намеренно не выводится: пока маршруты только в пределах
    // одной линии без пересадок, эта информация не нужна между платформой отправления и выходом.
    // route.toPlatformSteps при этом всё равно считается в route-builder.js — пригодится при появлении
    // пересадок, когда эту секцию надо будет вернуть.

    appendHeading(resultRegion, `Выход: ${route.toName}`);
    route.exitSteps.forEach((step) => {
      // Первый условный шаг выхода — это всегда поворот, зависящий от направления
      // прибытия, поэтому для него добавляем контекст. Обычные шаги (conditional: false)
      // остаются как есть.
      const text = step.conditional ? `После выхода из поезда ${lowerFirst(step.text)}` : step.text;
      appendStep(resultRegion, text);
    });

    // Единственное, что озвучивает NVDA автоматически, — короткое подтверждение.
    setStatus('Маршрут построен.');
  }

  function handleSubmit(event) {
    event.preventDefault();

    const fromId = fromCombobox.getSelectedId();
    const toId = toCombobox.getSelectedId();

    if (!fromId || !toId) {
      renderError('Выберите станцию отправления и станцию назначения из списка вариантов.');
      return;
    }

    const fromVestibuleId = fromEntranceRow.hidden ? undefined : fromEntranceSelect.value || undefined;
    const toVestibuleId = toExitRow.hidden ? undefined : toExitSelect.value || undefined;

    try {
      const route = buildRoute(fromId, toId, fromVestibuleId, toVestibuleId, stations, lines);
      renderRoute(route);
    } catch (err) {
      if (err instanceof RouteBuildError) {
        renderError(err.message);
      } else {
        renderError('Произошла непредвиденная ошибка при построении маршрута. Подробности — в консоли браузера.');
        console.error(err);
      }
    }
  }

  function handleSwap() {
    const fromId = fromCombobox.getSelectedId();
    const toId = toCombobox.getSelectedId();

    if (!fromId || !toId) {
      setStatus('Сначала выберите обе станции из списка вариантов, затем меняйте их местами.');
      return;
    }

    fromCombobox.setSelectedId(toId);
    toCombobox.setSelectedId(fromId);
    setStatus('Станции отправления и назначения поменяны местами.');
  }

  try {
    const data = await loadMetroData();
    stations = data.stations;
    lines = data.lines;
    initPickers();
  } catch (err) {
    setStatus(
      'Не удалось загрузить данные станций. Если вы открыли index.html двойным щелчком — ' +
        'запустите локальный сервер (например, "python -m http.server") и откройте сайт через http://localhost.'
    );
    console.error(err);
    return;
  }

  form.addEventListener('submit', handleSubmit);
  swapButton.addEventListener('click', handleSwap);
})();
