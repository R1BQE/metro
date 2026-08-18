/**
 * nav.js
 * Общее меню сайта — генерируется один раз здесь и подключается на каждой
 * странице через <div id="site-nav"></div> в <header>. Так пункты меню
 * (порядок, названия, ссылки) правятся в одном месте, а не в трёх html-файлах
 * по отдельности.
 *
 * Ссылка на текущую страницу помечается aria-current="page" — NVDA, VoiceOver
 * и TalkBack озвучивают такую ссылку как «текущая страница».
 */
(function () {
  var pages = [
    { href: 'index.html', label: 'Главная' },
    { href: 'instructions.html', label: 'Инструкции' },
    { href: 'about.html', label: 'О нас' },
  ];

  // Имя файла из текущего URL. Пустая строка (например, при открытии "/"
  // на сервере) считается главной страницей.
  var currentFile = location.pathname.split('/').pop() || 'index.html';

  var nav = document.createElement('nav');

  pages.forEach(function (page, index) {
    var link = document.createElement('a');
    link.href = page.href;
    link.textContent = page.label;
    if (page.href === currentFile) {
      link.setAttribute('aria-current', 'page');
    }
    nav.appendChild(link);

    if (index < pages.length - 1) {
      nav.appendChild(document.createElement('br'));
    }
  });

  var mountPoint = document.getElementById('site-nav');
  if (mountPoint) {
    mountPoint.replaceWith(nav);
  }
})();
