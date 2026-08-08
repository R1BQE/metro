/**
 * combobox.js
 * Поле поиска станции по названию (или части названия) + список кнопок
 * с найденными вариантами под ним.
 *
 * Сознательно НЕ используется ARIA-паттерн combobox/listbox (изначальная
 * версия): на практике проверено, что он плохо и непредсказуемо работает
 * с сенсорными читалками (VoiceOver, TalkBack) — жесты вокруг поля ввода
 * могли "схлопнуть" его и скрыть список вариантов. Версия на обычных
 * кнопках работает одинаково надёжно и с клавиатуры (NVDA), и жестами на
 * телефоне, потому что кнопка — самый базовый и однозначно поддерживаемый
 * элемент, без специальных ARIA-паттернов.
 *
 * Список результатов НЕ закрывается по потере фокуса полем ввода — это
 * специально: пользователь на сенсорном экране должен иметь возможность
 * спокойно touch-исследовать список пальцем, не боясь, что он "пропадёт",
 * стоит убрать палец с текстового поля.
 */
function createStationCombobox({ input, resultsContainer, resultStatus, options, emptyMessage }) {
  // Id выбранной станции. Есть значение только тогда, когда пользователь
  // явно нажал на вариант (или он был установлен программно через
  // setSelectedId) — набор текста в поле сам по себе выбором не считается.
  let selectedId;

  function render(list) {
    resultsContainer.innerHTML = '';

    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'station-results-empty';
      p.textContent = emptyMessage;
      resultsContainer.appendChild(p);
      resultStatus.textContent = emptyMessage;
      return;
    }

    list.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'station-option';
      btn.textContent = opt.label;
      if (opt.id === selectedId) {
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('is-selected');
      }
      btn.addEventListener('click', () => select(opt));
      resultsContainer.appendChild(btn);
    });

    resultStatus.textContent = `Найдено станций: ${list.length}`;
  }

  function filter(query) {
    const normalized = query.trim().toLowerCase();
    const list = normalized === ''
      ? options
      : options.filter((opt) => opt.label.toLowerCase().includes(normalized));
    render(list);
  }

  function select(opt) {
    selectedId = opt.id;
    input.value = opt.label;
    // Перерисовываем список тем же (текущим) текстом поля, чтобы выбранный
    // вариант получил визуальную/aria-pressed отметку "is-selected".
    filter(input.value);
  }

  input.addEventListener('input', () => {
    // Пока пользователь печатает, предыдущий выбор не действует — станция
    // должна быть подтверждена заново явным нажатием на кнопку варианта.
    selectedId = undefined;
    filter(input.value);
  });

  // Изначально показываем полный список станций (как и было в select) —
  // это же используется, если пользователь стирает весь текст в поле.
  filter('');

  return {
    /** Id выбранной станции, либо undefined, если валидного выбора нет. */
    getSelectedId() {
      return selectedId;
    },
    /**
     * Программно устанавливает станцию по id (используется кнопкой
     * "Поменять местами" и начальным заполнением формы). Специально НЕ
     * переводит фокус на input — иначе при первой загрузке страницы фокус
     * неожиданно прыгал бы на последнее из двух программно выставленных
     * полей.
     */
    setSelectedId(id) {
      const opt = options.find((o) => o.id === id);
      if (opt) select(opt);
    },
  };
}
