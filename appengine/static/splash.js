(function () {
    "use strict";
    // loading spinner
    const container = document.createElement("div");
    container.className = "container-2oOGIt";
    const inner = document.createElement("span");
    inner.className = "spinner-inner spinner-wandering-cubes";
    const item = document.createElement("span");
    item.className = "spinner-item";
    inner.appendChild(item);
    const item2 = document.createElement("span");
    item2.className = "spinner-item";
    inner.appendChild(item2);
    container.appendChild(inner);
    document.body.insertBefore(container, document.body.firstChild);
    document.addEventListener("DOMContentLoaded", event => {
        document.body.removeChild(container);
    }, { once: true });
})();
