/**
 * instructions.js
 * Разворачиваемые блоки инструкции по устройствам на странице instructions.html.
 *
 * Используется стандартный ARIA-паттерн "disclosure" (кнопка + aria-expanded +
 * aria-controls, панель скрыта атрибутом hidden). Отдельный aria-live статус
 * для объявления "развёрнуто/свёрнуто" не нужен: когда фокус стоит на кнопке
 * и её aria-expanded меняется, NVDA/VoiceOver/TalkBack сами озвучивают новое
 * состояние вместе с названием кнопки — это стандартное поведение читалок
 * для сфокусированного элемента с изменившимся ARIA-состоянием.
 *
 * Отдельной кнопки "Свернуть" внутри панели больше нет: повторное нажатие
 * той же кнопки устройства и разворачивает, и сворачивает панель (обычный
 * тумблер). Раньше была ещё кнопка "Свернуть" внутри содержимого, но с ней
 * NVDA иногда терял фокус в конец страницы, если кнопка была найдена не
 * табом, а стрелками в режиме чтения — а раз кнопка-переключатель и так
 * решает обе задачи, отдельная кнопка оказалась лишним риском без пользы.
 */
(function () {
  document.querySelectorAll('.device-toggle').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', () => {
      const panel = document.getElementById(toggleBtn.getAttribute('aria-controls'));
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';

      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      panel.hidden = isExpanded;
    });
  });
})();
