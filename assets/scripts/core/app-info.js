// Nom et version de l'application, lus dans package.json ("display" et "version").
// Le HTML garde "Shard Maps" en dur comme valeur de repli si le fichier est injoignable.
//   - le titre de l'onglet : "Shard Maps" y est remplacé par le nom affiché
//   - les éléments [data-app-name] reçoivent le nom affiché
//   - les éléments [data-app-version] reçoivent "v" + version
(function () {
  const DEFAULT_NAME = "Shard Maps";

  function applyAppInfo(pkg) {
    const name = pkg.display || DEFAULT_NAME;
    document.title = document.title.replace(DEFAULT_NAME, name);
    document.querySelectorAll("[data-app-name]").forEach((el) => {
      el.textContent = name;
    });
    if (pkg.version) {
      document.querySelectorAll("[data-app-version]").forEach((el) => {
        el.textContent = "v" + pkg.version;
      });
    }
  }

  const pkgPromise = fetch("/package.json", { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  document.addEventListener("DOMContentLoaded", function () {
    pkgPromise.then((pkg) => {
      if (pkg) applyAppInfo(pkg);
    });
  });
})();
