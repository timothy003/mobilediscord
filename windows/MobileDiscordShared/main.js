(function () {
    "use strict";
    const localSettings = Windows.Storage.ApplicationData.current.localSettings;
    const MIN_WIDTH = localSettings.values.MIN_WIDTH || 360;
    const MIN_HEIGHT = localSettings.values.MIN_HEIGHT || 500;
    const applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
    applicationView.setPreferredMinSize({ width: MIN_WIDTH, height: MIN_HEIGHT });
    const backgroundColor = { a: 255, r: 40, g: 43, b: 48 };
    const foregroundColor = Windows.UI.Colors.white;
    const titleBar = applicationView.titleBar;
    titleBar.backgroundColor = backgroundColor;
    titleBar.foregroundColor = foregroundColor;
    titleBar.buttonBackgroundColor = backgroundColor;
    titleBar.buttonForegroundColor = foregroundColor;
    titleBar.buttonHoverBackgroundColor = { a: 255, r: 61, g: 63, b: 68 };
    titleBar.buttonHoverForegroundColor = foregroundColor;
    titleBar.buttonPressedBackgroundColor = { a: 255, r: 83, g: 85, b: 89 };
    titleBar.buttonPressedForegroundColor = foregroundColor;
    // phone status bar
    if ("StatusBar" in Windows.UI.ViewManagement) {
        const statusBar = Windows.UI.ViewManagement.StatusBar.getForCurrentView();
        statusBar.backgroundColor = backgroundColor;
        statusBar.backgroundOpacity = 1;
        statusBar.foregroundColor = { a: 255, r: 201, g: 202, b: 203 };
        statusBar.showAsync();
    }
    Windows.UI.WebUI.WebUIApplication.onactivated = eventArgs => {
        let getImageLocation;
        if ("Phone" in Windows) {
            // SplashScreen gives us wrong location on Mobile
            getImageLocation = () => {
                applicationView.setDesiredBoundsMode(Windows.UI.ViewManagement.ApplicationViewBoundsMode.useCoreWindow);
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                applicationView.setDesiredBoundsMode(Windows.UI.ViewManagement.ApplicationViewBoundsMode.useVisible);
                let width = 620;
                let height = 300;
                // scale to fit
                if (width * windowHeight >= windowWidth * height) {
                    height = windowWidth * height / width;
                    width = windowWidth;
                } else {
                    width = windowHeight * width / height;
                    height = windowHeight;
                }
                const visibleBounds = applicationView.visibleBounds;
                const x = windowWidth / 2 - width / 2 - visibleBounds.x;
                const y = windowHeight / 2 - height / 2 - visibleBounds.y;
                return { x, y, width, height };
            };
        } else {
            const splash = eventArgs.splashScreen;
            getImageLocation = () => splash.imageLocation;
        }
        const extendedSplashImage = document.getElementById("extended-splash-image");
        function positionImage() {
            const imageRect = getImageLocation();
            extendedSplashImage.style.top = imageRect.y + "px";
            extendedSplashImage.style.left = imageRect.x + "px";
            extendedSplashImage.style.height = imageRect.height + "px";
            extendedSplashImage.style.width = imageRect.width + "px";
        }
        positionImage();
        applicationView.onvisibleboundschanged = eventArgs => {
            positionImage();
        };
        const extendedSplashScreen = document.getElementById("extended-splash-screen");
        extendedSplashScreen.hidden = false;
        MSApp.execAsyncAtPriority(() => {
            const releaseChannel = buildInfo.releaseChannel;
            const WEBAPP_ENDPOINT = buildInfo.WEBAPP_ENDPOINT || (releaseChannel === "stable" ? "https://mobilediscord.com" : "https://" + releaseChannel + ".mobilediscord.com");
            let lastUrl;
            if (eventArgs.previousExecutionState === Windows.ApplicationModel.Activation.ApplicationExecutionState.terminated)
                lastUrl = localSettings.values.lastUrl;
            const appPath = "/channels/@me";
            const WEBAPP_PATH = lastUrl || localSettings.values.WEBAPP_PATH || appPath;
            const urlToLoad = "" + WEBAPP_ENDPOINT + WEBAPP_PATH;
            location.replace(urlToLoad);
            // preload webrtc
            Org.WebRtc.WinJSHooks.initialize();
        }, MSApp.HIGH);
    };
})();
