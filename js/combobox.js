/**
 * combobox.js
 * Поле поиска станции (обычный текстовый input, работает только как фильтр)
 * + обычный нативный <select> со списком станций, отфильтрованным по этому
 * тексту (или полным списком, если поле пустое).
 *
 * Почему так, а не кастомный ARIA combobox/listbox (использовался раньше) и
 * не список кнопок (использовался после него): у нативного <select> открытие/
 * закрытие списка, позиционирование, объявление количества и текущей позиции
 * варианта — всё это реализовано самим браузером и ОС, а не нашим JS. Кнопки
 * были надёжны, но при большом числе станций растягивали страницу и раздували
 * последовательность табуляции/свайпов. Комбобокс по ARIA-паттерну оказался
 * ненадёжен на сенсорных читалках (VoiceOver/TalkBack) — с этим уже
 * сталкивались на реальных устройствах. Пара «текстовое поле + select» не
 * реализует руками ни одно из этих поведений — риск свести к минимуму.
 */
function createStationPicker({ input, select, options, onSelect }) {
  // Id выбранной станции. Есть значение только тогда, когда в select реально
  // выбран настоящий вариант (не служебный плейсхолдер) — либо пользователем,
  // либо программно через setSelectedId.
  let selectedId;

  function findOption(id) {
    return options.find((opt) => opt.id === id);
  }

  /**
   * Перестраивает список <option> внутри select под переданный список
   * вариантов. Если id, который был выбран до этого, всё ещё есть в новом
   * списке — оставляем его выбранным (native select сам покажет его текущим
   * значением). Если его больше нет в списке (например, из-за фильтрации по
   * тексту) — добавляем невидимый для реального выбора служебный плейсхолдер,
   * чтобы select не выбрал произвольно первый попавшийся вариант молча, без
   * явного действия пользователя.
   */
  function render(list) {
    select.innerHTML = '';

    const stillValid = selectedId != null && list.some((opt) => opt.id === selectedId);
    if (!stillValid) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = list.length > 0 ? 'Выберите станцию из списка' : 'Станции не найдены';
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
    }

    list.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.id;
      optionEl.textContent = opt.label;
      if (opt.id === selectedId) {
        optionEl.selected = true;
      }
      select.appendChild(optionEl);
    });
  }

  function filter(query) {
    const normalized = query.trim().toLowerCase();
    const list = normalized === ''
      ? options
      : options.filter((opt) => opt.label.toLowerCase().includes(normalized));
    render(list);
  }

  function confirmSelection(id) {
    selectedId = id || undefined;
    if (typeof onSelect === 'function') {
      onSelect(selectedId);
    }
  }

  // Пользователь напечатал что-то в поле — пересобираем список select под
  // новый текст. Если станция, выбранная ранее, всё ещё есть среди
  // отфильтрованных вариантов — выбор сохраняется (это по-прежнему то же
  // самое явное решение пользователя, просто список вокруг него сузился).
  // Если пропала — select покажет плейсхолдер, выбора нет, пока не подтвердят заново.
  input.addEventListener('input', () => {
    filter(input.value);
    // filter()/render() уже решили, остался ли прошлый выбор среди отфильтрованных
    // вариантов (тогда select.value — по-прежнему его id) или показан плейсхолдер
    // (тогда select.value === ''). confirmSelection() просто фиксирует то, что видно в select.
    confirmSelection(select.value || undefined);
  });

  // Пользователь выбрал вариант в select — это и есть момент подтверждения
  // выбора. Дописываем полное название станции обратно в текстовое поле для
  // наглядности (это не запускает повторную фильтрацию — событие 'input' не
  // возникает при программной установке .value).
  select.addEventListener('change', () => {
    const opt = findOption(select.value);
    if (opt) {
      input.value = opt.label;
    }
    confirmSelection(select.value || undefined);
  });

  // Изначально — полный список станций, ничего не отфильтровано.
  filter('');

  return {
    /** Id выбранной станции, либо undefined, если валидного выбора нет. */
    getSelectedId() {
      return selectedId;
    },
    /**
     * Программно устанавливает станцию по id (используется кнопкой
     * "Поменять местами" и начальным заполнением select при загрузке
     * страницы). Всегда пересобирает select на полном (нефильтрованном)
     * списке станций — так после свапа пользователь снова видит весь
     * список, а не сузившийся с прошлого раза. Специально не переводит
     * фокус на input.
     *
     * updateInput: false — не трогать текстовое поле (используется при
     * начальном заполнении формы: select должен сразу содержать валидную
     * станцию, чтобы форму можно было сразу отправить, но само текстовое
     * поле при загрузке страницы должно остаться пустым — пользователь
     * либо печатает своё, либо явно выбирает вариант из select, и только
     * тогда название появляется в поле). При свапе (⇄) вызывается без этого
     * флага — там дописывание в input как раз ожидаемо — это подтверждение
     * произошедшей замены станций местами.
     */
    setSelectedId(id, { updateInput = true } = {}) {
      const opt = findOption(id);
      if (!opt) return;
      selectedId = id;
      if (updateInput) {
        input.value = opt.label;
      }
      filter('');
      confirmSelection(id);
    },
  };
}

/**
 * Заполняет обычный select вариантами вестибюлей (вход или выход) без
 * фильтрации по тексту — вестибюлей всегда мало (2-3), отдельное текстовое
 * поле для поиска среди них не нужно. Всегда добавляет невыбранный
 * плейсхолдер первым пунктом — станции с несколькими входами/выходами не
 * должны получать вход "по умолчанию": какой физический вход выбран, влияет
 * на итоговый текст маршрута, значит выбор обязан быть явным действием
 * пользователя.
 */
function populateVestibuleSelect(select, vestibules) {
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Выберите вариант';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  vestibules.forEach((vestibule) => {
    const optionEl = document.createElement('option');
    optionEl.value = vestibule.id;
    optionEl.textContent = vestibule.name;
    select.appendChild(optionEl);
  });
}
