// Общие сведения для страниц документов: адрес сайта и почта для обращений.
// Почту меняйте здесь, в одном месте. Пока её нет, страницы предлагают писать через «Отзыв о Потоке».
(function () {
  var MAIL = '';
  var site = location.origin + location.pathname.replace(/[^/]*$/, '');
  document.querySelectorAll('[data-site]').forEach(function (el) { el.textContent = site; el.setAttribute('href', site); });
  document.querySelectorAll('[data-mail-line]').forEach(function (el) {
    if (!MAIL) { el.remove(); return; }
    el.querySelectorAll('[data-mail]').forEach(function (a) { a.textContent = MAIL; a.setAttribute('href', 'mailto:' + MAIL); });
  });
})();
