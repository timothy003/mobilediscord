(function () {
    "use strict";
    if ("Windows" in self) {
        const applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
        const backgroundColor = { a: 255, r: 32, g: 34, b: 37 };
        const foregroundColor = Windows.UI.Colors.white;
        const titleBar = applicationView.titleBar;
        titleBar.backgroundColor = backgroundColor;
        titleBar.foregroundColor = foregroundColor;
        titleBar.buttonBackgroundColor = backgroundColor;
        titleBar.buttonForegroundColor = foregroundColor;
        titleBar.buttonHoverBackgroundColor = { a: 255, r: 53, g: 55, b: 58 };
        titleBar.buttonHoverForegroundColor = foregroundColor;
        titleBar.buttonPressedBackgroundColor = { a: 255, r: 76, g: 78, b: 80 };
        titleBar.buttonPressedForegroundColor = foregroundColor;
        titleBar.inactiveBackgroundColor = backgroundColor;
        titleBar.inactiveForegroundColor = { a: 255, r: 121, g: 122, b: 124 };
        titleBar.buttonInactiveBackgroundColor = backgroundColor;
        titleBar.buttonInactiveForegroundColor = { a: 255, r: 121, g: 122, b: 124 };
        // phone status bar
        if ("StatusBar" in Windows.UI.ViewManagement) {
            const statusBar = Windows.UI.ViewManagement.StatusBar.getForCurrentView();
            const progressIndicator = statusBar.progressIndicator;
            statusBar.backgroundColor = backgroundColor;
            statusBar.backgroundOpacity = 1;
            statusBar.foregroundColor = { a: 255, r: 199, g: 200, b: 200 };
            progressIndicator.hideAsync();
            statusBar.showAsync();
        }
    }
    // loading spinner
    const container = document.createElement("div");
    container.className = "connecting container-2oOGIt";
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
