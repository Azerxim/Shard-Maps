const parsePathName = function () {
  const pathname = window.location.pathname.split("/").pop();
  const args = { data: "tetrago", file: "", option: "" };

  if (pathname) {
    const parts = pathname.split("-");

    for (const part of parts) {
      let key;
      switch (part) {
        case "embed":
        case "embedfull":
        case "locate":
        case "editor":
          key = "file";
          break;

        case "civilisations":
        case "commerces":
        case "alliances":
        case "religions":
        case "guerres":
          key = "option";
          break;

        default:
          key = "data";
          break;
      }
      args[key] = part;
    }
  }
  return args;
};

const parseSearch = function () {
  const args = {};

  if (window.location.search) {
    const parts = window.location.search.substring(1).split("&");

    for (const part of parts) {
      const key_value = part.split("=");
      const key = key_value[0],
        value = key_value.slice(1).join("=");

      args[key] = value;
    }
  }

  return args;
};

// Échappe le texte saisi par les utilisateurs avant de l'insérer dans du HTML
// (popups / tooltips Leaflet).
const escapeHtml = function (value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Ajoute le code couleur de la zone en tête de sa popup
const withZoneColor = function (popup, color) {
  if (!color) return popup;
  const safeColor = escapeHtml(color);
  return `
    <div class="flex flex-col gap-2">
      <div class="flex flex-row items-center gap-2">
        <span>Couleur:</span>
        <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(127, 127, 127, 0.6); background-color: ${safeColor};"></span>
        <code style="user-select: all;">${safeColor}</code>
      </div>
      ${popup ?? ""}
    </div>`;
};

function logEvent(e) {
  console.log(e);
}

document.addEventListener("DOMContentLoaded", () => {
  const $button = Array.prototype.slice.call(
    document.querySelectorAll(".button-apparition"),
    0
  );

  if ($button.length > 0) {
    $button.forEach((el) => {
      el.addEventListener("click", () => {
        const target = el.dataset.target;
        const $targets = document.getElementsByClassName(target);

        Array.from($targets).forEach(($target) => {
          if ($target.style.display == "none") {
            $target.style.display = "flex";
          } else {
            $target.style.display = "none";
          }
        });
      });
    });
  }
});
