(function () {
    "use strict";
    // loading spinner
    const container = document.createElement("div");
    container.className = "spinner-2enMB9 md-loading";
    const inner = document.createElement("span");
    inner.className = "inner-1gJC7_";
    const item = document.createElement("span");
    item.className = "wanderingCubesItem-WPXqao";
    inner.appendChild(item);
    const item2 = document.createElement("span");
    item2.className = "wanderingCubesItem-WPXqao";
    inner.appendChild(item2);
    container.appendChild(inner);
    document.addEventListener("DOMContentLoaded", function ondomcontentloaded(event) {
        try {
            document.removeEventListener("DOMContentLoaded", ondomcontentloaded);
            if (document.querySelector(".loading-Ags1CY")) {
                new MutationObserver((mutations, observer) => {
                    if (!document.querySelector(".loading-Ags1CY")) {
                        observer.disconnect();
                        document.body.removeChild(container);
                    }
                }).observe(document.body, { childList: true, subtree: true });
            } else
                document.body.removeChild(container);
        } catch (e) {
            document.body.removeChild(container);
            throw e;
        }
    });
    document.body.appendChild(container);
})();
