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
    if (/\bEdge\b/.test(ua))
        ;
    else if (/\bOPR\b/.test(ua))
        ua = ua.replace(/ Mobile\b/, "");
    else if (/\bChrome\b/.test(ua))
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
            let stateChanged = false;
            window.addEventListener("popstate", event => {
                stateChanged = true;
            }, true);
            const systemNavigationManager = Windows.UI.Core.SystemNavigationManager.getForCurrentView();
            systemNavigationManager.addEventListener("backrequested", eventArgs => {
                if (eventArgs.handled)
                    return;
                if ((() => {
                    if (document.querySelector(".contextMenu-HLZMGh")) {
                        document.body.click();
                        return true;
                    }
                    const activeElement = document.activeElement;
                    if (activeElement)
                        if (activeElement.matches(".css-2yldzf-control .css-gj7qu5-dummyInput")) {
                            activeElement.blur();
                            return true;
                        }
                    if (document.webkitFullscreenElement) {
                        document.webkitExitFullscreen();
                        return true;
                    }
                    if (document.querySelector(".popout-2iWAc-")) {
                        document.body.click();
                        return true;
                    }
                    const backdrop = document.querySelector(".backdrop-1wrmKB");
                    if (backdrop) {
                        activeElement.blur();
                        backdrop.click();
                        return true;
                    }
                    const btn = document.querySelector(".closeButton-1tv5uR");
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    stateChanged = false;
                    history.back();
                    return stateChanged;
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
                                    compactOptions.customSize = { width: 312, height: 500 };
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

        const { WebUIApplication } = Windows.UI.WebUI;
        WebUIApplication.addEventListener("suspending", eventArgs => {
            // save session state
            const url = location.pathname + location.search;
            Windows.Storage.ApplicationData.current.localSettings.values.lastUrl = url;
        });
        WebUIApplication.addEventListener("resuming", eventArgs => {
            // perform expedited heartbeat
            const online = new Event("online");
            window.dispatchEvent(online);
        });

        // HACK: login page must be loaded on discordapp.com for reCAPTCHA
        function getScript() {
            let s = `if (!("mdLocalStorage" in window)) {
    // HACK: Edge 14 is unsupported
    const compatibleUserAgent = navigator.userAgent.replace(" Edge/14.", " Edge/15.");
    if (compatibleUserAgent != navigator.userAgent)
        Object.defineProperty(navigator, "userAgent", { value: compatibleUserAgent });

    // reCAPTCHA expects HTMLIFrameElement.contentWindow == MessageEvent.source, but Discord removes the iframe upon verification before all the messages are processed, preventing reCAPTCHA from closing the challenge.
    // Copy Chrome by making MessageEvent.source return undefined if the iframe is no longer in the DOM.
    const origSource = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "source").get;
    Object.defineProperty(MessageEvent.prototype, "source", {
        get() {
            const source = origSource.call(this);
            if (source && source.top !== window.top)
                return undefined;
            return source;
        }
    });
    window.mdLocalStorage = localStorage;
`;
            // Include inline scripts from the current document.
            // CSP requires a nonce, which isn't supported on Edge 14.
            if (!("nonce" in HTMLElement.prototype))
                for (let i = 0; i < document.scripts.length; i++) {
                    const script = document.scripts[i];
                    if (script.hasAttribute("nonce"))
                        s += `    eval(\`${script.text.replace(/[`$]/g, "\\$&")}\`);
`;
                }
            s += `}
mdLocalStorage.token;
`;
            return s;
        }
        const origin = document.currentScript.dataset.origin;
        const appMount = document.getElementById("app-mount");
        class Login {
            constructor() {
                const webview = document.createElement("x-ms-webview");
                this.webview = webview;
                webview.className = "md-login";
                this.script = `delete localStorage.token;
` + getScript();
                webview.addEventListener("MSWebViewContentLoading", event => {
                    if (!this.webview)
                        return;
                    const operation = this.webview.invokeScriptAsync("eval", this.script);
                    operation.oncomplete = event => {
                        if (!this.webview)
                            return;
                        const result = event.target.result;
                        if (result) {
                            this.close();
                            window.addEventListener("beforeunload", event => {
                                localStorage.token = result;
                            });
                            location.replace("/app");
                            appMount.hidden = true;
                        }
                    };
                    operation.onerror = event => {
                        console.error("error invoking script:", event.target.error);
                        this.close();
                    };
                    operation.start();
                    this.script = getScript();
                });
                webview.addEventListener("MSWebViewNavigationCompleted", event => {
                    if (!event.isSuccess) {
                        console.error("login navigation failed (" + event.webErrorStatus + ")");
                        this.close();
                    }
                });
                webview.src = (origin || "https://discordapp.com") + "/login";
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
            try {
                if (location.pathname === "/login") {
                    if (!login)
                        login = new Login();
                } else
                    if (login) {
                        login.close();
                        login = null;
                    }
            } catch (e) {
                console.error(e);
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
        document.addEventListener("DOMContentLoaded", event => {
            updateState();
        });
    }
    if (embedded) {
        // hide download nag
        localStorage.hideNag = "true";
        // hide "download apps" button
        document.documentElement.classList.add("md-app");
    }

    // polyfill CSS variables for Edge 14
    if ("cssVars" in window)
        cssVars();

    // fix broken URLs when running locally
    if (location.protocol != "https:") {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            url = String(url)
            if (url.startsWith(location.protocol))
                arguments[1] = url.replace(location.protocol, "https:");
            origOpen.apply(this, arguments);
        };

        if ("backgroundImage" in CSSStyleDeclaration.prototype) {
            const origSetBackgroundImage = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "backgroundImage").set;
            Object.defineProperty(CSSStyleDeclaration.prototype, "backgroundImage", {
                set(value) {
                    if (value !== null)
                        value = String(value).replace(location.protocol, "https:");
                    origSetBackgroundImage.call(this, value);
                }
            });
        } else {
            const origGetStyle = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style").get;
            Object.defineProperty(HTMLElement.prototype, "style", {
                get() {
                    const style = origGetStyle.call(this);
                    const proxy = new Proxy(style, {
                        get(target, p, receiver) {
                            return Reflect.get(target, p);
                        },
                        set(target, p, value, receiver) {
                            if (p == "backgroundImage")
                                if (value !== null)
                                    value = String(value).replace(location.protocol, "https:");
                            return Reflect.set(target, p, value);
                        }
                    });
                    Object.defineProperty(this, "style", {
                        configurable: true,
                        enumerable: true,
                        value: proxy
                    });
                    return proxy;
                }
            });
        }

        const origSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (qualifiedName, value) {
            if (qualifiedName == "src")
                arguments[1] = String(value).replace(location.protocol, "https:");
            origSetAttribute.apply(this, arguments);
        };

        WebSocket = new Proxy(WebSocket, {
            construct(target, argumentsList, newTarget) {
                argumentsList[0] = String(argumentsList[0]).replace("ws:", "wss:");
                return Reflect.construct(target, argumentsList, newTarget);
            }
        });
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
    // swap DataTransfer.items so that the string comes first
    const origItems = Object.getOwnPropertyDescriptor(DataTransfer.prototype, "items").get;
    Object.defineProperty(DataTransfer.prototype, "items", {
        get() {
            const items = origItems.call(this);
            if (items.length === 2 && items[0].kind === "file" && items[1].kind === "string")
                [items[0], items[1]] = [items[1], items[0]];
            return items;
        }
    });
    // move grabber if slider is pressed
    window.addEventListener("mousedown", event => {
        const target = event.target;
        if (target.matches(".slider-1PF9SW")) {
            const grabber = target.querySelector(".grabber-3mFHz2");
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
                if (!target.matches(".slider-1PF9SW"))
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

    // keep touch keyboard open on submit
    let keyPressEvent = null;
    window.addEventListener("keypress", event => {
        // ChannelTextArea.handleKeyPress
        if (event.target.matches(".textArea-2Spzkt"))
            switch (event.which) {
                case 13:
                    if (!event.shiftKey && !event.ctrlKey) {
                        setTimeout(() => {
                            keyPressEvent = null;
                        });
                        keyPressEvent = event;
                    }
            }
    }, true);
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function setAttribute(qualifiedName, value) {
        if (keyPressEvent != null && keyPressEvent.eventPhase != Event.NONE)
            if (this === keyPressEvent.target)
                if (qualifiedName == "disabled")
                    return;
        return origSetAttribute.apply(this, arguments);
    };

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
                    ".input-cIJ7To," +
                    ".container-VSDcQc .input-1ppKdn," +
                    ".quickMessage-2XpSaN," +
                    ".input-1Rv96N," +
                    ".textArea-2Spzkt"
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

    // replace transparent WebM
    // Edge doesn't support alpha transparency in videos.
    HTMLSourceElement.prototype.setAttribute = function (qualifiedName, value) {
        if (qualifiedName == "src")
            if (value == "/assets/0bdc0497eb3a19e66f2b1e3d5741634c.webm")
                arguments[1] = "/assets/md/connecting.webm";
        HTMLElement.prototype.setAttribute.apply(this, arguments);
    };

    // insert image placeholders
    // prevents messages from jumping when images load
    function updateImagePlaceholders() {
        const images = document.querySelectorAll(".imageWrapper-2p5ogY[style], .embedVideo-3nf0O9[style]");
        for (let i = 0; i < images.length; ++i) {
            const wrapper = images[i];
            if (!wrapper.matches(".embedVideo-3nf0O9 > .imageWrapper-2p5ogY")) {
                const width = parseInt(wrapper.style.width, 10);
                const height = parseInt(wrapper.style.height, 10);
                let placeholder = wrapper.querySelector(".md-image-placeholder");
                if (placeholder) {
                    if (width)
                        placeholder.width = width;
                    if (height)
                        placeholder.height = height;
                } else {
                    placeholder = document.createElement("canvas");
                    placeholder.className = "md-image-placeholder";
                    placeholder.width = width;
                    placeholder.height = height;
                    wrapper.insertBefore(placeholder, wrapper.firstChild);
                }
            }
            wrapper.removeAttribute("style");
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

    window.addEventListener("mousedown", event => {
        // make video call focusable
        const videoWrapper = event.target.closest(".videoWrapper-2wbLD-, .overlay-1NmNEg");
        if (videoWrapper)
            videoWrapper.tabIndex = -1;
    });

    function hideTooltip() {
        for (const tooltip of document.querySelectorAll(".tooltip-2QfLtc"))
            tooltip.hidden = true;
    }
    function deferEvent(event) {
        return new Promise((resolve, reject) => {
            const target = event.target;
            event.mdDeferred = true;
            Object.defineProperty(event, "defaultPrevented", { value: false });
            // https://nolanlawson.com/2018/09/25/accurately-measuring-layout-on-the-web/
            requestAnimationFrame(time => {
                setTimeout(() => {
                    target.dispatchEvent(event);
                    resolve();
                });
            });
            event.preventDefault();
            event.stopImmediatePropagation();
        });
    }
    function animateLayer(event, button, animationName) {
        const layer = button.closest(".layers-3iHuyZ > .layer-3QrUeG");
        layer.style.animationName = animationName;
        deferEvent(event).then(() => {
            if (!layer.matches(".animating-rRxada"))
                layer.style.animationName = "";
        });
    }
    function animateNavigation(event, guild) {
        let selectors = ".messagesWrapper-3lZDfY," +
            ".noChannel-Z1DQK7 > .wrapper-r-6rrt," +
            ".scrollWrap-qwpLpa," +
            ".friendsTable-133bsv .friendsTableBody-1ZhKif," +
            ".layout-1cQCv2";
        if (guild)
            selectors += ", .privateChannels-1nO12o .scroller-2FKFPG, .scroller-2wx7Hm";
        for (const element of document.querySelectorAll(selectors))
            element.style.animation = ".1s cubic-bezier(0.4, 0.0, 1, 1) forwards md-fade-out";
        deferEvent(event).then(() => {
            for (const element of document.querySelectorAll(selectors))
                element.style.animation = ".2s cubic-bezier(0.0, 0.0, 0.2, 1) md-fade-in";
        });
    }
    window.addEventListener("click", event => {
        if (event.mdDeferred)
            return;
        const element = event.target;

        // animate settings navigation
        const button = element.closest(".iconItem-1-bXkn, .button-2JbWXs");
        if (button) {
            if (button.querySelector("svg[name='Gear']")) {
                hideTooltip();
                animateLayer(event, button, "md-layer-under");
            }
            return;
        }
        const btn = element.closest(".closeButton-1tv5uR");
        if (btn) {
            if (!document.querySelector(".container-2VW0UT"))
                animateLayer(event, btn, "md-layer-out");
            return;
        }

        // animate guild navigation
        if (element.closest(".acronym-2mOFsV, .wrapper-1BJsBx")) {
            if (document.querySelector(".contextMenu-HLZMGh"))
                return;
            hideTooltip();
            animateNavigation(event, !(element.closest(".blob-3RT82C") && document.querySelector(".privateChannels-1nO12o")));
            return;
        }
        // animate channel navigation
        const channel = element.closest(".wrapper-1ucjTd, .channel-2QD9_O a");
        if (channel) {
            if (element.closest(".wrapper-1ucjTd [role=button], .close-3hZ5Ni"))
                return;
            if (channel.matches(".channel-2QD9_O a") && document.querySelector(".contextMenu-HLZMGh"))
                return;
            animateNavigation(event, false);
            return;
        }

        // jump to message when tapping a search result
        const sink = element.closest(".searchResultMessage-2VxO12.hit-NLlWXA .clickOverride-1J40_l");
        if (sink) {
            const jumpButton = sink.parentElement.querySelector(".jumpButton-Ia2hRJ");
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

        // sidebar item: scroll to content
        const item = element.closest(".side-8zPYf6 .item-PXvHYJ, .role-3wi9Tf");
        if (item) {
            if (item.matches(".role-3wi9Tf"))
                document.querySelector(".contentRegionScrollerWrap-3YZXdm").scrollIntoView({ behavior: "smooth", inline: "end" });
            else if (item.matches(".selected-3s45Ha"))
                document.querySelector(".contentRegion-3nDuYy").scrollIntoView({ behavior: "smooth", inline: "start" });
            return;
        }

        // scroll to chat when tapping a channel or jump button
        if (element.closest(
            ".wrapper-1ucjTd," +
            ".jumpButton-Ia2hRJ," +
            ".channelName-1QajIf," +
            ".messageGroupWrapper-o-Zw7G .clickOverride-1J40_l," +
            ".actionButtons-1sUUug .jumpButton-3DTcS_," +
            ".channelName-3kBz6H," +
            ".channel-2QD9_O a," +
            ".blob-3RT82C"
        )) {
            if (element.closest(".wrapper-1ucjTd [role=button], .close-3hZ5Ni"))
                return;
            const chat = document.querySelector(
                ".content-yTz4x3 > .spacer-1fA9zc," +
                ".scrollWrap-qwpLpa," +
                ".friendsTable-133bsv," +
                ".activityFeed-1C0EmJ"
            );
            chat.scrollIntoView({ behavior: "smooth" });
            return;
        }
        // open topic
        if (element.closest(".topic-TCb_qw.expandable-9fI_e3")) {
            if (!document.querySelector(".modal-yWgWj-")) {
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
            const message = event.target.closest(".message-1PNnaP, .content-3dzVd8");
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
                if (message.querySelector(".reactionBtn-2na4rd"))
                    addCommand(strings.ADD_REACTION, command => {
                        const btn = message.querySelector(".reactionBtn-2na4rd");
                        btn.click();
                    });
                const btn = message.querySelector(".button-3Jq0g9");
                if (btn) {
                    const action = command => {
                        const btn = message.querySelector(".button-3Jq0g9");
                        if (!btn.classList.contains("popout-open"))
                            btn.click();
                        const popout = document.querySelector(".container-3cGP6G");
                        try {
                            for (const item of popout.querySelectorAll(".item-2J1YMK"))
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
                    const popout = document.querySelector(".container-3cGP6G");
                    try {
                        for (const item of popout.querySelectorAll(".item-2J1YMK"))
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
    const appMount = document.getElementById("app-mount");
    if (appMount) {
        // CSS animations for layers
        const layersCollection = document.getElementsByClassName("layers-3iHuyZ");
        const layerObserver = new MutationObserver((mutations, observer) => {
            for (const { target: layer } of mutations)
                if (layer.matches(".animating-rRxada")) {
                    if (!layer.style.animationName)
                        if ((layer.style.opacity || 1) < 0.5)
                            layer.style.animationName = "md-layer-in";
                        else
                            layer.style.animationName = !layer.nextElementSibling ? "md-layer-out" : "md-layer-under";
                } else
                    layer.style.animationName = "";
        });
        const observeLayer = layer => layerObserver.observe(layer, { attributes: true, attributeFilter: ["class"] });
        const layersObserver = new MutationObserver((mutations, observer) => {
            for (const mutation of mutations)
                for (const node of mutation.addedNodes)
                    if (node instanceof HTMLElement) {
                        node.style.animationName = "md-layer-in";
                        observeLayer(node);
                    }
        });

        // adjust popout position
        // TODO: handle window resize
        const layerContainers = document.getElementsByClassName("layerContainer-yqaFcK");
        const popoutsCollection = document.getElementsByClassName("popouts-2bnG9Z");
        const moveIntoView = popout => {
            const rect = popout.getBoundingClientRect();
            const appRect = appMount.getBoundingClientRect();
            const { style } = popout;
            if (rect.left < appRect.left)
                if (style.left)
                    style.left = parseFloat(style.left) - (rect.left - appRect.left) + "px";
                else
                    style.right = parseFloat(style.right) + (rect.left - appRect.left) + "px";
            else if (rect.right > appRect.right)
                if (style.left)
                    style.left = parseFloat(style.left) - (rect.right - appRect.right) + "px";
                else
                    style.right = parseFloat(style.right) + (rect.right - appRect.right) + "px";
            if (rect.top < appRect.top)
                if (style.top)
                    style.top = parseFloat(style.top) - (rect.top - appRect.top) + "px";
                else
                    style.bottom = parseFloat(style.bottom) + (rect.top - appRect.top) + "px";
            else if (rect.bottom > appRect.bottom)
                if (style.top)
                    style.top = parseFloat(style.top) - (rect.bottom - appRect.bottom) + "px";
                else
                    style.bottom = parseFloat(style.bottom) + (rect.bottom - appRect.bottom) + "px";
        };
        const popoutsObserver = new MutationObserver((mutations, observer) => {
            for (const mutation of mutations)
                for (const node of mutation.addedNodes)
                    if (node instanceof HTMLElement)
                        moveIntoView(node);
        });

        new MutationObserver((mutations, observer) => {
            // also observe children
            for (const mutation of mutations)
                if (mutation.target === appMount)
                    for (const node of mutation.addedNodes)
                        observer.observe(node, { childList: true });

            for (const layers of layersCollection) {
                for (const layer of layers.children)
                    if (layer instanceof HTMLElement)
                        observeLayer(layer);
                layersObserver.observe(layers, { childList: true });
            }

            for (const layerContainer of layerContainers)
                popoutsObserver.observe(layerContainer, { childList: true });
            for (const popouts of popoutsCollection)
                popoutsObserver.observe(popouts, { childList: true });
        }).observe(appMount, { childList: true });
    }
})(localStorage);
