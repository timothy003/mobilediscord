(function () {
    "use strict";
    // loading spinner
    const connecting = document.createElement("div");
    connecting.className = "connecting";
    const inner = document.createElement("span");
    inner.className = "spinner-inner spinner-wandering-cubes";
    const item = document.createElement("span");
    item.className = "spinner-item";
    inner.appendChild(item);
    const item2 = document.createElement("span");
    item2.className = "spinner-item";
    inner.appendChild(item2);
    connecting.appendChild(inner);
    document.body.insertBefore(connecting, document.body.firstChild);
    document.addEventListener("DOMContentLoaded", event => {
        document.body.removeChild(connecting);
    }, { once: true });
})();
