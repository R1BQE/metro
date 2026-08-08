/**
 * data-loader.js
 * Загружает данные линий и станций метро из JSON-файлов в папке data/.
 *
 * Важно: этот файл использует fetch() для чтения локальных JSON-файлов.
 * Браузеры блокируют fetch() для страниц, открытых напрямую как file://,
 * поэтому сайт нужно открывать через локальный сервер, например:
 *   python -m http.server 8000
 * и заходить на http://localhost:8000/
 */

const DATA_PATH = 'data';

/**
 * Загружает lines.json и все станции, упомянутые в нём.
 *
 * @returns {Promise<{lines: Object, stations: Object}>}
 *   lines — словарь line_id -> { id, name, stations: [id, id, ...] }
 *   stations — словарь station_id -> объект станции из data/stations/*.json
 */
async function loadMetroData() {
  const linesResponse = await fetch(`${DATA_PATH}/lines.json`);
  if (!linesResponse.ok) {
    throw new Error(`Не удалось загрузить lines.json: HTTP ${linesResponse.status}`);
  }
  const linesRaw = await linesResponse.json();

  const lines = {};
  const stationIds = new Set();

  for (const line of linesRaw.lines) {
    lines[line.id] = line;
    for (const stationId of line.stations) {
      stationIds.add(stationId);
    }
  }

  const stations = {};
  const loadErrors = [];

  await Promise.all(
    Array.from(stationIds).map(async (id) => {
      try {
        const response = await fetch(`${DATA_PATH}/stations/${id}.json`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        stations[id] = await response.json();
      } catch (err) {
        loadErrors.push({ id, message: err.message });
      }
    })
  );

  if (loadErrors.length > 0) {
    // Не прерываем загрузку из-за одной сломанной станции,
    // но обязательно сообщаем в консоль, чтобы проблему было видно при отладке.
    console.error('Не удалось загрузить данные некоторых станций:', loadErrors);
  }

  return { lines, stations };
}
