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
 * Превращает id линии вида "line2" в номер папки "2".
 * Станции лежат в data/<номер линии>/<station_id>.json — так удобнее
 * ориентироваться в файлах проекта, чем в одной плоской папке на все линии.
 */
function lineFolder(lineId) {
  return lineId.replace(/^line/, '');
}

/**
 * Загружает lines.json и все станции, упомянутые в нём.
 *
 * @returns {Promise<{lines: Object, stations: Object}>}
 *   lines — словарь line_id -> { id, name, stations: [id, id, ...] }
 *   stations — словарь station_id -> объект станции из data/<номер линии>/*.json
 */
async function loadMetroData() {
  const linesResponse = await fetch(`${DATA_PATH}/lines.json`);
  if (!linesResponse.ok) {
    throw new Error(`Не удалось загрузить lines.json: HTTP ${linesResponse.status}`);
  }
  const linesRaw = await linesResponse.json();

  const lines = {};
  // station_id -> line_id, чтобы знать, в какой папке искать файл станции
  const stationLine = new Map();

  for (const line of linesRaw.lines) {
    lines[line.id] = line;
    for (const stationId of line.stations) {
      stationLine.set(stationId, line.id);
    }
  }

  const stations = {};
  const loadErrors = [];

  await Promise.all(
    Array.from(stationLine.entries()).map(async ([id, lineId]) => {
      try {
        const response = await fetch(`${DATA_PATH}/${lineFolder(lineId)}/${id}.json`);
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
