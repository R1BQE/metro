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
  const fromResults = document.getElementById('station-from-results');
  const fromResultStatus = document.getElementById('station-from-result-status');

  const toInput = document.getElementById('station-to-input');
  const toResults = document.getElementById('station-to-results');
  const toResultStatus = document.getElementById('station-to-result-status');

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
   * Это единственный элемент с aria-live на странице (не считая скрытых
   * result-status у комбобоксов) — озвучивается NVDA целиком, поэтому здесь
   * всегда должен быть только один короткий факт, а не весь маршрут.
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
   * Строит список станций line2 для комбобоксов и создаёт оба комбобокса.
   * Станции со status "no_data" остаются в списке (как раньше в select), но
   * с пометкой "(данных пока нет)" — если пользователь всё же выберет такую
   * станцию, buildRoute() сам вернёт понятную ошибку при построении маршрута.
   */
  function initComboboxes() {
    const line = lines['line2'];
    if (!line) {
      setStatus('В данных не найдена линия line2.');
      return;
    }

    const options = line.stations
      .map((id) => stations[id])
      .filter(Boolean)
      .map((station) => ({
        id: station.id,
        label: station.status === 'no_data' ? `${station.name} (данных пока нет)` : station.name,
      }));

    fromCombobox = createStationCombobox({
      input: fromInput,
      resultsContainer: fromResults,
      resultStatus: fromResultStatus,
      options,
      emptyMessage: 'Станции не найдены',
    });

    toCombobox = createStationCombobox({
      input: toInput,
      resultsContainer: toResults,
      resultStatus: toResultStatus,
      options,
      emptyMessage: 'Станции не найдены',
    });

    // По умолчанию выбираем две разные станции, чтобы форма сразу была валидной.
    if (options.length > 1) {
      fromCombobox.setSelectedId(options[0].id);
      toCombobox.setSelectedId(options[1].id);
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

    try {
      const route = buildRoute(fromId, toId, stations, lines);
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
    initComboboxes();
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
