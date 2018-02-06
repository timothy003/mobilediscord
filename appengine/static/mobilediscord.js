(function (localStorage) {
    "use strict";
    const strings = {
        ADD_REACTION: "Add Reaction",
        COPY: "Copy",
        COPY_LINK: "Copy Link",
        STATUSBAR_CONNECTING: "Connecting...",
        STATUSBAR_DISCONNECTED_RECONNECTING: seconds => `Disconnected — reconnecting in ${seconds} sec`,
        STATUSBAR_DISCONNECTED_RETRYING: seconds => `Disconnected — retrying in ${seconds} sec`,
    };
    // keep custom styles last in order
    const styles = document.getElementById("md-styles");
    new MutationObserver((mutations, observer) => {
        for (const mutation of mutations)
            for (const node of mutation.addedNodes)
                if (node instanceof HTMLLinkElement)
                    if (node !== styles) {
                        document.head.appendChild(styles);
                        return;
                    }
    }).observe(document.head, { childList: true });
    // use desktop UA strings to enable WebRTC
    let isSafari = false;
    let ua = navigator.userAgent;
    if (/\bOPR\b/.test(ua)) {
        ua = ua.replace(/ Mobile\b/, "");
        // disable buggy paint containment
        document.documentElement.classList.add("md-no-contain-paint");
    } else if (/\bChrome\b/.test(ua))
        ua = ua.replace(/.*?\b(AppleWebKit\/[^ ]+).*?\b(Chrome\/[^ ]+).*?\b(Safari\/[^ ]+).*/, "$1 $2 $3");
    else if (/\bFirefox\b/.test(ua)) {
        ua = ua.replace(/\bAndroid[^;)]*; /, "");
        ua = ua.replace(/\b(?:Mobile|Tablet|TV); /, "");
    } else if (/\bSafari\b/.test(ua)) {
        isSafari = true;
        ua = ua.replace(/\b(?:iPad|iPhone|iPod)\b/g, "");
    }
    if (navigator.userAgent !== ua)
        Object.defineProperty(navigator, "userAgent", { value: ua });
    // Element.matches() for Edge (fixes topic opening)
    if (!("matches" in Element.prototype))
        Element.prototype.matches = Element.prototype.msMatchesSelector;
    if (!("closest" in Element.prototype))
        Element.prototype.closest = function (selectors) {
            let element = this;
            do {
                if (element.matches(selectors))
                    return element;
            } while (element = element.parentElement);
            return null;
        };
    function copyTextToClipboard(textToCopy) {
        const dataPackage = new Windows.ApplicationModel.DataTransfer.DataPackage();
        dataPackage.setText(textToCopy);
        Windows.ApplicationModel.DataTransfer.Clipboard.setContent(dataPackage);
    }
    let embedded = false;
    if ("Windows" in self) { // Windows Runtime
        embedded = true;
        try {
            const applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
            // phone status bar
            if ("StatusBar" in Windows.UI.ViewManagement) {
                const statusBar = Windows.UI.ViewManagement.StatusBar.getForCurrentView();
                const progressIndicator = statusBar.progressIndicator;
                let timeoutId = 0;
                const origWarn = console.warn;
                console.warn = function (...data) {
                    origWarn.apply(this, arguments);
                    if (data[0] === "%c[GatewaySocket]")
                        if (typeof data[2] === "string")
                            if (data[2].startsWith("[WS CLOSED]") || data[2].startsWith("[ACK TIMEOUT]") || data[2].startsWith("[DISCOVERY FAIL]")) {
                                const result = / (retrying|reconnecting) in ([\d\.]+) seconds\.$/.exec(data[2]);
                                if (result) {
                                    const time = Number(result[2]);
                                    if (time) {
                                        const string = result[1] === "retrying" ? strings.STATUSBAR_DISCONNECTED_RETRYING : strings.STATUSBAR_DISCONNECTED_RECONNECTING;
                                        const timestamp = performance.now() + time * 1000;
                                        function updateText() {
                                            const timeRemaining = Math.max(0, timestamp - performance.now());
                                            const seconds = Math.ceil(timeRemaining / 1000);
                                            progressIndicator.text = string(seconds);
                                            if (seconds)
                                                timeoutId = setTimeout(updateText, Math.ceil(timeRemaining - (seconds - 1) * 1000));
                                        }
                                        clearTimeout(timeoutId);
                                        updateText();
                                        progressIndicator.progressValue = 0;
                                        progressIndicator.showAsync();
                                    }
                                }
                            } else if (data[2].startsWith("[RESET] (true, 4004,")) {
                                clearTimeout(timeoutId);
                                progressIndicator.hideAsync();
                            }
                };
                const origInfo = console.info;
                console.info = function (...data) {
                    origInfo.apply(this, arguments);
                    if (data[0] === "%c[GatewayDiscovery]") {
                        if (typeof data[2] === "string")
                            if (data[2].startsWith("[STICKY]") || data[2].startsWith("[DISCOVERING]")) {
                                clearTimeout(timeoutId);
                                progressIndicator.text = strings.STATUSBAR_CONNECTING;
                                progressIndicator.progressValue = null;
                                progressIndicator.showAsync();
                            }
                    } else if (data[0] === "%c[GatewaySocket]")
                        if (typeof data[2] === "string")
                            if (data[2].startsWith("[READY]") || data[2].startsWith("[RESUMED]")) {
                                clearTimeout(timeoutId);
                                progressIndicator.hideAsync();
                            }
                };
            }
            // handle back button
            const systemNavigationManager = Windows.UI.Core.SystemNavigationManager.getForCurrentView();
            systemNavigationManager.addEventListener("backrequested", eventArgs => {
                if (eventArgs.handled)
                    return;
                if ((() => {
                    if (document.querySelector(".contextMenu-uoJTbz")) {
                        document.dispatchEvent(new MouseEvent("mousedown"));
                        return true;
                    }
                    const activeElement = document.activeElement;
                    if (activeElement)
                        if (activeElement.matches(".is-open .Select-input")) {
                            activeElement.blur();
                            return true;
                        }
                    if (document.webkitFullscreenElement) {
                        document.webkitExitFullscreen();
                        return true;
                    }
                    if (document.querySelector(".popout")) {
                        document.body.click();
                        return true;
                    }
                    const backdrop = document.querySelector(".callout-backdrop, .backdrop-2ohBEd");
                    if (backdrop) {
                        activeElement.blur();
                        backdrop.click();
                        return true;
                    }
                    const btn = document.querySelector(".ui-standard-sidebar-view .btn-close");
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                })())
                    eventArgs.handled = true;
            });
            // fullscreen video support for build < 15063
            window.addEventListener("webkitfullscreenchange", event => {
                if (document.webkitFullscreenElement)
                    applicationView.tryEnterFullScreenMode();
                else
                    applicationView.exitFullScreenMode();
            }, true);
            // open links in browser
            class FakeLocation {
                set href(url) {
                    Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(document.baseURI, url));
                }
            }
            class FakeWindow {
                get location() {
                    return new FakeLocation();
                }
                set location(url) {
                    this.location.href = url;
                }
            }
            window.open = function (url, target, features, replace) {
                if (!url)
                    return new FakeWindow();
                Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(document.baseURI, url));
                return null;
            };
            // compact overlay
            if ("ApplicationViewMode" in Windows.UI.ViewManagement) {
                const { ApplicationViewMode, ViewModePreferences } = Windows.UI.ViewManagement;
                if (applicationView.isViewModeSupported(ApplicationViewMode.compactOverlay))
                    window.addEventListener("keydown", event => {
                        if (event.defaultPrevented)
                            return;
                        if (!event.ctrlKey && event.altKey && event.key === "Enter") {
                            if (!event.repeat)
                                if (applicationView.viewMode === ApplicationViewMode.default) {
                                    const compactOptions = ViewModePreferences.createDefault(ApplicationViewMode.compactOverlay);
                                    compactOptions.customSize = { width: 288, height: 412 };
                                    applicationView.tryEnterViewModeAsync(ApplicationViewMode.compactOverlay, compactOptions);
                                } else
                                    applicationView.tryEnterViewModeAsync(ApplicationViewMode.default);
                            event.preventDefault();
                        }
                    });
            }
        } catch (e) {
            console.error(e);
        }
        // enable web notifications
        if ("Notification" in self)
            Notification.requestPermission();
        // stay on this page when activated
        MSApp.pageHandlesAllApplicationActivations(true);
        // save session state
        Windows.UI.WebUI.WebUIApplication.addEventListener("suspending", eventArgs => {
            const url = location.pathname + location.search;
            Windows.Storage.ApplicationData.current.localSettings.values.lastUrl = url;
        });
        // HACK: login page must be loaded on discordapp.com for reCAPTCHA
        const appMount = document.getElementById("app-mount");
        class Login {
            constructor() {
                const webview = document.createElement("x-ms-webview");
                this.webview = webview;
                webview.className = "md-login";
                this.script = "delete localStorage.token; window.mdLocalStorage = localStorage";
                webview.addEventListener("MSWebViewContentLoading", event => {
                    if (!this.webview)
                        return;
                    const operation = this.webview.invokeScriptAsync("eval", this.script);
                    operation.oncomplete = event => {
                        if (!this.webview)
                            return;
                        const result = event.target.result;
                        if (result) {
                            localStorage.token = result;
                            this.close();
                            window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
                        }
                    };
                    operation.onerror = event => {
                        this.close();
                    };
                    operation.start();
                    this.script = "window.mdLocalStorage = window.mdLocalStorage || localStorage; mdLocalStorage.token";
                });
                webview.addEventListener("MSWebViewNavigationCompleted", event => {
                    if (!event.isSuccess)
                        this.close();
                });
                webview.src = MD_ORIGIN + "/login";
                document.body.appendChild(webview);
                webview.focus();
                appMount.hidden = true;
            }
            close() {
                const webview = this.webview;
                if (!webview)
                    return;
                this.webview = null;
                appMount.hidden = false;
                webview.remove();
                webview.src = "about:blank";
            }
        }
        let login = null;
        function updateState() {
            if (location.pathname === "/login") {
                if (!login)
                    login = new Login();
            } else
                if (login) {
                    login.close();
                    login = null;
                }
        }
        const origPushState = history.pushState;
        history.pushState = function (data, title, url) {
            origPushState.apply(this, arguments);
            updateState();
        };
        const origReplaceState = history.replaceState;
        history.replaceState = function (data, title, url) {
            origReplaceState.apply(this, arguments);
            updateState();
        };
        updateState();
    }
    if (embedded) {
        // hide download nag
        localStorage.hideNag = "true";
        // hide "download apps" button
        document.documentElement.classList.add("md-app");
    }
    // disable xhr caching for Edge < 14
    if ("msCaching" in XMLHttpRequest.prototype) {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            origOpen.apply(this, arguments);
            this.msCaching = "disabled";
        };
    }
    // AudioContext.close for Edge < 14
    if ("AudioContext" in self)
        if (!("close" in AudioContext.prototype))
            AudioContext.prototype.close = function () {
                return Promise.resolve();
            };
    // File constructor for Edge
    const origFile = File;
    File = function (fileBits, fileName, options) {
        try {
            return new origFile(...arguments);
        } catch (e) {
            const n = fileName.replace("/", ":");
            const F = new Blob(fileBits, options);
            F.name = n;
            return F;
        }
    };
    // convert DataTransfer.types to a frozen array
    const origTypes = Object.getOwnPropertyDescriptor(DataTransfer.prototype, "types").get;
    Object.defineProperty(DataTransfer.prototype, "types", {
        get() {
            const types = origTypes.call(this);
            if (types instanceof DOMStringList)
                return Object.freeze(Array.from(types));
            else
                return types;
        }
    });
    // move slider if track is touched
    window.addEventListener("mousedown", event => {
        const target = event.target;
        if (target.matches(".track-1h2wOF")) {
            const grabber = target.querySelector(".grabber-1TZCZi");
            const rect = grabber.getBoundingClientRect();
            const mouseDown = new MouseEvent("mousedown", {
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                composed: event.composed,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2
            });
            if (!grabber.dispatchEvent(mouseDown))
                event.preventDefault();
            event.stopImmediatePropagation();
            const mouseMove = new MouseEvent("mousemove", event);
            target.dispatchEvent(mouseMove);
        }
    }, true);
    if ("ontouchstart" in window) {
        // mouse events for sliders
        // compatibility mouse events aren't generated when both touch events and pointer events are supported
        if ("onpointerdown" in window) {
            function handlePointerDown(event) {
                const target = event.target;
                if (!target.matches(".track-1h2wOF, .grabber-1TZCZi"))
                    return;
                if (!event.isPrimary)
                    return;
                event.preventDefault();
                window.addEventListener("pointermove", handlePointerMove);
                window.addEventListener("pointerup", handlePointerUp);
                window.addEventListener("pointercancel", handlePointerUp);
                const mouseEvent = new MouseEvent("mousedown", event);
                target.dispatchEvent(mouseEvent);
            }
            function handlePointerMove(event) {
                if (!event.isPrimary)
                    return;
                const mouseEvent = new MouseEvent("mousemove", event);
                event.target.dispatchEvent(mouseEvent);
            }
            function handlePointerUp(event) {
                if (!event.isPrimary)
                    return;
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
                window.removeEventListener("pointercancel", handlePointerUp);
                const mouseEvent = new MouseEvent("mouseup", event);
                event.target.dispatchEvent(mouseEvent);
            }
            window.addEventListener("pointerdown", handlePointerDown);
        }
        // prevent adding global touch event listeners
        if ("EventTarget" in self) {
            const origAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (type === "touchmove" || type === "touchstart" || type === "touchend")
                    if (this === window || this === document)
                        return;
                return origAddEventListener.apply(this, arguments);
            };
        }
    }
    // prevent auto focusing
    // touch keyboard is shown when focusing a text box in touch/tablet mode
    function hasTouchKeyboard() {
        if ("Windows" in self)
            return Windows.UI.ViewManagement.UIViewSettings.getForCurrentView().userInteractionMode === Windows.UI.ViewManagement.UserInteractionMode.touch;
        else
            return window.matchMedia("(pointer: coarse)").matches;
    }
    function isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 && rect.bottom <= document.documentElement.clientHeight && rect.right <= document.documentElement.clientWidth;
    }
    function wrapFocus(origFocus) {
        return function () {
            out: try {
                if (!this.matches(
                    ".input-2YozMi," +
                    ".quickMessage-318jK-," +
                    ".quick-message," +
                    "#autocomplete-popout input[type=text]," +
                    ".need-help-modal .header #help-query," +
                    ".textArea-20yzAH," +
                    ".emojiPicker-3g68GS .search-bar input"
                ))
                    break out;
                // allow if a text box already has focus
                const activeElement = document.activeElement;
                if (activeElement instanceof HTMLInputElement && activeElement.type === "text" || activeElement instanceof HTMLTextAreaElement)
                    break out;
                if (hasTouchKeyboard())
                    return;
                if (!isElementInViewport(this))
                    return;
            } catch (e) {
                console.error(e);
            }
            return origFocus.apply(this, arguments);
        };
    }
    HTMLTextAreaElement.prototype.focus = wrapFocus(HTMLTextAreaElement.prototype.focus);
    Object.defineProperty(HTMLTextAreaElement.prototype, "selectionStart", { set: wrapFocus(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "selectionStart").set) });
    Object.defineProperty(HTMLTextAreaElement.prototype, "selectionEnd", { set: wrapFocus(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "selectionEnd").set) });
    HTMLInputElement.prototype.focus = wrapFocus(HTMLInputElement.prototype.focus);
    // handle gateway authentication failure on Edge
    // Edge fires a CloseEvent with status code 1005 instead of 4004, preventing Discord from logging out automatically.
    const origCode = Object.getOwnPropertyDescriptor(CloseEvent.prototype, "code").get;
    Object.defineProperty(CloseEvent.prototype, "code", {
        get() {
            let c = origCode.call(this);
            if (c === 1005)
                if (this.reason === "Authentication failed.") {
                    const gatewayURL = JSON.parse(localStorage.gatewayURL);
                    if (this.target.url.lastIndexOf(gatewayURL, 0) === 0)
                        c = 4004;
                }
            return c;
        }
    });
    // set audio category (prevents muting background music)
    HTMLMediaElement.prototype.setAttribute = function (name, value) {
        if (name === "autoplay") {
            // connecting spinner
            if ("msAudioCategory" in this)
                this.msAudioCategory = "SoundEffects";
            this.muted = true;
            if ("playsInline" in this)
                this.playsInline = true;
        }
        return HTMLElement.prototype.setAttribute.apply(this, arguments);
    };
    if ("msAudioCategory" in HTMLMediaElement.prototype) {
        Audio = new Proxy(Audio, {
            construct(target, argumentsList, newTarget) {
                const audio = Reflect.construct(target, argumentsList, newTarget);
                audio.msAudioCategory = "SoundEffects";
                return audio;
            }
        });
        Audio.prototype.constructor = Audio;
    }
    // handle audio loading and unloading
    const origSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src").set;
    const openElements = new Set();
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
        set(value) {
            // Edge fetches the page URL if src is set to ""
            if (value === "") {
                this.removeAttribute("src");
                this.load();
                return;
            }
            origSrc.call(this, value);
            // prevent element from being garbage collected before it's loaded
            function ondone(event) {
                this.removeEventListener("loadeddata", ondone);
                this.removeEventListener("error", ondone);
                openElements.delete(this);
            }
            this.addEventListener("loadeddata", ondone);
            this.addEventListener("error", ondone);
            openElements.add(this);
        }
    });
    // insert image placeholders
    // prevents messages from jumping when images load
    function updateImagePlaceholders() {
        const images = document.querySelectorAll(".imageWrapperInner-BRGZ7A:first-child, .embedGIFTag-2V6BC0 + video");
        for (let i = 0; i < images.length; ++i) {
            const inner = images[i];
            const wrapper = inner.parentElement;
            const placeholder = document.createElement("canvas");
            placeholder.className = "md-image-placeholder";
            placeholder.width = inner.width || parseInt(wrapper.style.width, 10);
            placeholder.height = inner.height || parseInt(wrapper.style.height, 10);
            wrapper.insertBefore(placeholder, inner);
        }
    }
    const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight").get;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        get() {
            updateImagePlaceholders();
            return origOffsetHeight.call(this);
        }
    });
    // prevent scrolling to the same position (e.g. reactions)
    const origScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop").set;
    Object.defineProperty(Element.prototype, "scrollTop", {
        set(value) {
            if (this.scrollTop === value)
                return;
            origScrollTop.call(this, value);
        }
    });
    // remove video resolution constraints
    // some devices fail to start with these constraints on Android
    if ("mediaDevices" in navigator) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = function (constraints) {
            if (typeof constraints.video === "object")
                if ("optional" in constraints.video)
                    constraints.video.optional = constraints.video.optional.filter(constraint => {
                        for (const key in constraint)
                            if (key in { minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1, minFrameRate: 1, maxFrameRate: 1 })
                                return false;
                        return true;
                    });
            return origGetUserMedia.apply(this, arguments);
        };
    }
    function deferEvent(event, applyStyles, revertStyles) {
        try {
            applyStyles();
            const target = event.target;
            const clonedEvent = new event.constructor(event.type, event);
            setTimeout(() => {
                try {
                    target.dispatchEvent(clonedEvent);
                } finally {
                    revertStyles();
                }
            });
        } catch (e) {
            revertStyles();
            throw e;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    function animateNavigation(event, ...styles) {
        deferEvent(event, () => {
            for (const [element, props] of styles)
                if (element)
                    for (const key in props)
                        element.style[key] = props[key];
        }, () => {
            for (const [element, props] of styles)
                if (element)
                    for (const key in props)
                        element.style[key] = "";
        });
    }
    window.addEventListener("click", event => {
        if (!event.isTrusted)
            return;
        const element = event.target;
        // animate guild navigation
        if (element.closest(".guilds-wrapper .guilds .guild .guild-inner a")) {
            if (!element.closest(".guild.active, .guild.selected")) {
                const channels = document.querySelector(".scroller-NXV0-d, .private-channels .scroller-fzNley");
                const chat = document.querySelector(".chat .messages-wrapper, .chat > .content > .flex-lFgbSz, .channels-wrap + .wrapper-1-BJK5, .noChannel-2EQ0a9 > .wrapper-1-BJK5, #friends .friends-table");
                const tooltip = document.querySelector(".tooltip");
                // channels animation is buggy on Safari - use transition instead
                animateNavigation(event,
                    [channels, isSafari ? { opacity: "0", transitionTimingFunction: "ease-in" } : { animation: "md-fade-out .1s ease-in forwards" }],
                    [chat, { animation: "md-fade-out .1s ease-in forwards" }],
                    [tooltip, { display: "none" }]
                );
            }
            return;
        }
        // animate channel navigation
        if (element.closest(
            ".wrapperDefaultText-3M3F1R," +
            ".wrapperHoveredText-1PA_Uk," +
            ".wrapperLockedText-Dsondf," +
            ".wrapperMutedText-34VhKk," +
            ".wrapperSelectedText-31jJa8," +
            ".wrapperUnreadText-1MykVG," +
            ".private-channels .channel a"
        )) {
            if (element.closest(".iconSpacing-5GIHkT, .private-channels .channel .close"))
                return;
            const chat = document.querySelector(".chat .messages-wrapper, .chat > .content > .flex-lFgbSz, #friends .friends-table");
            if (!element.closest(".wrapperSelectedText-31jJa8, .private-channels .channel.selected"))
                animateNavigation(event, [chat, { animation: "md-fade-out .1s ease-in forwards" }]);
            return;
        }
        // animate settings navigation
        const button = element.closest("div.button-1aU9q1");
        if (button) {
            const layer = button.closest(".layers-20RVFW > .layer-kosS71, .layers > .layer");
            const tooltip = document.querySelector(".tooltip");
            animateNavigation(event,
                [layer, { animationName: "md-layer-under", pointerEvents: "none" }],
                [tooltip, { display: "none" }]
            );
            return;
        }
        const btn = element.closest(".ui-standard-sidebar-view .btn-close");
        if (btn) {
            if (!document.querySelector(".container-2oeFrl, .ui-settings-notice")) {
                const layer = btn.closest(".layers-20RVFW > .layer-kosS71, .layers > .layer");
                animateNavigation(event, [layer, { animationName: "md-layer-out", pointerEvents: "none" }]);
            }
            return;
        }
        // jump to message when tapping a search result
        const sink = element.closest(".search-results-wrap .search-result .search-result-message.hit .sink-interactions");
        if (sink) {
            const jumpButton = sink.parentElement.querySelector(".action-buttons .jump-button");
            if (jumpButton) {
                event.stopImmediatePropagation();
                jumpButton.click();
            }
            return;
        }
    }, true);
    window.addEventListener("click", event => {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=184051
        if (event.button !== 0)
            return;
        const element = event.target;
        // scroll to content when tapping a settings tab
        if (element.closest(".side-2nYO0F .item-3879bf.selected-eNoxEK")) {
            const content = document.querySelector(".ui-standard-sidebar-view .content-region");
            content.scrollIntoView({ behavior: "smooth" });
            return;
        }
        // scroll to chat when tapping a channel or jump button
        if (element.closest(
            ".wrapperDefaultText-3M3F1R," +
            ".wrapperHoveredText-1PA_Uk," +
            ".wrapperLockedText-Dsondf," +
            ".wrapperMutedText-34VhKk," +
            ".wrapperSelectedText-31jJa8," +
            ".wrapperUnreadText-1MykVG," +
            ".guilds-wrapper .dms a," +
            ".private-channels .channel a," +
            ".messages-popout .channel-separator .channel-name," +
            ".messages-popout .message-group .action-buttons .jump-button," +
            ".messages-popout .message-group .sink-interactions," +
            ".search-results-wrap .channel-separator .channel-name," +
            ".search-results-wrap .action-buttons .jump-button"
        )) {
            if (element.closest(".iconSpacing-5GIHkT, .private-channels .channel .close"))
                return;
            const chat = document.querySelector(".chat .messages-wrapper, .chat > .content > .flex-lFgbSz, #friends .friends-table");
            chat.scrollIntoView({ behavior: "smooth" });
            return;
        }
        // open topic
        if (element.closest(".topic-1KFf6J")) {
            if (!document.querySelector(".modal-3HOjGZ")) {
                element.dispatchEvent(new MouseEvent("mousedown", event));
                element.dispatchEvent(new MouseEvent("mouseup", event));
            }
            return;
        }
    });
    // context menu for messages
    if ("Windows" in self)
        window.addEventListener("contextmenu", event => {
            if (event.defaultPrevented)
                return;
            const message = event.target.closest(".message-group .comment > div");
            if (message) {
                const menu = new Windows.UI.Popups.PopupMenu();
                const addCommand = (label, action) => {
                    try {
                        menu.commands.append(new Windows.UI.Popups.UICommand(label, action));
                    } catch (e) {
                        console.warn(e);
                    }
                };
                if (!document.getSelection().isCollapsed)
                    addCommand(strings.COPY, command => {
                        copyTextToClipboard(document.getSelection());
                    });
                if (message.querySelector(".btn-reaction"))
                    addCommand(strings.ADD_REACTION, command => {
                        const btn = message.querySelector(".btn-reaction");
                        btn.click();
                    });
                const btn = message.querySelector(".btn-option");
                if (btn) {
                    const action = command => {
                        const btn = message.querySelector(".btn-option");
                        if (!btn.classList.contains("popout-open"))
                            btn.click();
                        const popout = document.querySelector(".option-popout");
                        try {
                            for (const item of popout.querySelectorAll(".btn-item"))
                                if (item.textContent === command.label) {
                                    item.click();
                                    break;
                                }
                        } finally {
                            document.body.click();
                            popout.parentElement.style.display = "none";
                        }
                    };
                    btn.click();
                    const popout = document.querySelector(".option-popout");
                    try {
                        for (const item of popout.querySelectorAll(".btn-item"))
                            addCommand(item.textContent, action);
                    } finally {
                        document.body.click();
                        popout.parentElement.style.display = "none";
                    }
                }
                const link = event.target.closest("a");
                if (link)
                    if (link.href)
                        addCommand(strings.COPY_LINK, command => {
                            copyTextToClipboard(link.href);
                        });
                const zoomFactor = document.documentElement.msContentZoomFactor;
                menu.showAsync({
                    x: (event.pageX - pageXOffset) * zoomFactor,
                    y: (event.pageY - pageYOffset) * zoomFactor
                });
                event.preventDefault();
            }
        });
    const mount = document.getElementById("app-mount");
    if (mount) {
        new MutationObserver((mutations, observer) => {
            for (const mutation of mutations)
                for (const node of mutation.addedNodes)
                    if (node instanceof Element) {
                        // CSS animations for layers
                        const observe = element => {
                            const layers = element.querySelector(".layers-20RVFW, .layers");
                            if (layers) {
                                const observeLayer = layer => {
                                    new MutationObserver((mutations, observer) => {
                                        if (layer.matches(".animating-XaAvB3, .animating"))
                                            if (layer.style.opacity === "0") {
                                                layer.style.animationName = "md-layer-in";
                                                layer.style.pointerEvents = "";
                                            } else {
                                                layer.style.animationName = !layer.nextElementSibling ? "md-layer-out" : "md-layer-under";
                                                layer.style.pointerEvents = "none";
                                            }
                                        else {
                                            layer.style.animationName = "";
                                            if (layer.style.opacity === "0")
                                                layer.style.pointerEvents = "none";
                                            else
                                                layer.style.pointerEvents = "";
                                        }
                                    }).observe(layer, { attributes: true, attributeFilter: ["class"] });
                                };
                                for (let i = 0; i < layers.children.length; i++) {
                                    const layer = layers.children[i];
                                    if (layer instanceof HTMLElement)
                                        observeLayer(layer);
                                }
                                new MutationObserver((mutations, observer) => {
                                    for (const mutation of mutations)
                                        for (const node of mutation.addedNodes)
                                            if (node instanceof HTMLElement) {
                                                node.style.animationName = "md-layer-in";
                                                observeLayer(node);
                                            }
                                }).observe(layers, { childList: true });
                            }
                        };
                        observe(node);
                        new MutationObserver((mutations, observer) => {
                            for (const mutation of mutations)
                                for (const node of mutation.addedNodes)
                                    if (node instanceof Element)
                                        observe(node);
                            updateImagePlaceholders();
                        }).observe(node, { childList: true });
                        // adjust popout position
                        // TODO: handle window resize
                        const popouts = node.matches(".popouts") ? node : node.querySelector(".tooltips + div, .popouts");
                        if (popouts)
                            new MutationObserver((mutations, observer) => {
                                for (const mutation of mutations)
                                    for (const node of mutation.addedNodes)
                                        if (node instanceof HTMLElement)
                                            if (node.classList.contains("popout")) {
                                                const rect = node.getBoundingClientRect();
                                                if (rect.left < 0)
                                                    node.style.left = node.offsetLeft - rect.left + "px";
                                                else {
                                                    const viewportRight = document.documentElement.clientWidth;
                                                    if (rect.right > viewportRight)
                                                        node.style.left = node.offsetLeft - (rect.right - viewportRight) + "px";
                                                }
                                            }
                            }).observe(popouts, { childList: true });
                    }
        }).observe(mount, { childList: true });
    }
})(localStorage);
