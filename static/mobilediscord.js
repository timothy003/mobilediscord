(function (localStorage) {
    "use strict";
    const strings = {
        SEND_MESSAGE: "Send message",
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

    let embedded = false;
    if ("Windows" in self) { // Windows Runtime
        embedded = true;
        try {
            const { ApplicationView, StatusBar } = Windows.UI.ViewManagement;
            const applicationView = ApplicationView.getForCurrentView();
            const statusBar = StatusBar ? StatusBar.getForCurrentView() : null;

            // phone status bar
            if (statusBar) {
                const progressIndicator = statusBar.progressIndicator;
                progressIndicator.hideAsync();
                statusBar.showAsync();
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
                    if (document.querySelector(
                        ".userPopout-3XzG_A," +
                        ".popout-2iWAc-," +
                        ".emojiPicker-3m1S-j"
                    )) {
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

            // color title/status bar
            const { fromArgb } = Windows.UI.ColorHelper;
            const titleBar = applicationView.titleBar;
            new MutationObserver((mutations, observer) => {
                if (document.documentElement.matches(".theme-dark")) {
                    const backgroundColor = fromArgb(255, 32, 34, 37);
                    const foregroundColor = Windows.UI.Colors.white;
                    titleBar.backgroundColor = backgroundColor;
                    titleBar.foregroundColor = foregroundColor;
                    titleBar.buttonBackgroundColor = backgroundColor;
                    titleBar.buttonForegroundColor = foregroundColor;
                    titleBar.buttonHoverBackgroundColor = fromArgb(255, 53, 55, 58);
                    titleBar.buttonHoverForegroundColor = foregroundColor;
                    titleBar.buttonPressedBackgroundColor = fromArgb(255, 76, 78, 80);
                    titleBar.buttonPressedForegroundColor = foregroundColor;
                    titleBar.inactiveBackgroundColor = backgroundColor;
                    titleBar.inactiveForegroundColor = fromArgb(255, 121, 122, 124);
                    titleBar.buttonInactiveBackgroundColor = backgroundColor;
                    titleBar.buttonInactiveForegroundColor = fromArgb(255, 121, 122, 124);
                    if (statusBar) {
                        statusBar.backgroundColor = backgroundColor;
                        statusBar.backgroundOpacity = 1;
                        statusBar.foregroundColor = fromArgb(255, 199, 200, 200);
                    }
                }
                if (document.documentElement.matches(".theme-light")) {
                    const backgroundColor = fromArgb(255, 227, 229, 232);
                    const foregroundColor = Windows.UI.Colors.black;
                    titleBar.backgroundColor = backgroundColor;
                    titleBar.foregroundColor = foregroundColor;
                    titleBar.buttonBackgroundColor = backgroundColor;
                    titleBar.buttonForegroundColor = foregroundColor;
                    titleBar.buttonHoverBackgroundColor = fromArgb(255, 204, 206, 209);
                    titleBar.buttonHoverForegroundColor = foregroundColor;
                    titleBar.buttonPressedBackgroundColor = fromArgb(255, 181, 183, 185);
                    titleBar.buttonPressedForegroundColor = foregroundColor;
                    titleBar.inactiveBackgroundColor = backgroundColor;
                    titleBar.inactiveForegroundColor = fromArgb(255, 136, 137, 139);
                    titleBar.buttonInactiveBackgroundColor = backgroundColor;
                    titleBar.buttonInactiveForegroundColor = fromArgb(255, 136, 137, 139);
                    if (statusBar) {
                        statusBar.backgroundColor = backgroundColor;
                        statusBar.backgroundOpacity = 1;
                        statusBar.foregroundColor = fromArgb(255, 91, 92, 93);
                    }
                }
            }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
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

        // HACK: login page must be loaded on discord.com for reCAPTCHA
        const INIT_SCRIPT = `if (!("mdLocalStorage" in window)) {
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

    // fix QR code
    const origDecrypt = SubtleCrypto.prototype.decrypt;
    SubtleCrypto.prototype.decrypt = function decrypt(algorithm, key, data) {
        if (algorithm.hash == undefined)
            algorithm.hash = "SHA-256";
        return origDecrypt.apply(this, arguments);
    };

    window.mdLocalStorage = localStorage;
}
mdLocalStorage.token;
`;
        const origin = document.currentScript.dataset.origin;
        const appMount = document.getElementById("app-mount");
        class Login {
            constructor() {
                const webview = document.createElement("x-ms-webview");
                this.webview = webview;
                webview.className = "md-login";
                this.script = `delete localStorage.token;
` + INIT_SCRIPT;
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
                    this.script = INIT_SCRIPT;
                });
                webview.addEventListener("MSWebViewNavigationCompleted", event => {
                    if (!event.isSuccess) {
                        console.error("login navigation failed (" + event.webErrorStatus + ")");
                        this.close();
                    }
                });
                webview.src = (origin || "https://discord.com") + "/login";
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
    }

    // polyfill CSS variables for Edge 14
    if ("cssVars" in window)
        cssVars();

    // Redirect is not allowed for a preflight request.
    if (location.protocol != "https:") {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function open(method, url) {
            url = String(url);
            if (url.startsWith(location.protocol + window.GLOBAL_ENV.API_ENDPOINT))
                arguments[1] = url.replace(location.protocol, "https:");
            return origOpen.apply(this, arguments);
        };
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
    function isSendKey(event) {
        // ChannelTextArea.handleKeyPress
        if (event.target.matches(".textArea-12jD-V"))
            switch (event.keyCode) {
                case 13:
                    if (!event.shiftKey && !event.ctrlKey)
                        return true;
            }
        return false;
    }
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function setAttribute(qualifiedName, value) {
        if (qualifiedName == "disabled")
            if (window.event && event.type == "keypress")
                if (this === event.target)
                    if (isSendKey(event))
                        return;
        return origSetAttribute.apply(this, arguments);
    };

    // send button
    function updateButtons(textArea) {
        const { form } = textArea;
        if (!form)
            return;
        let sendButton = form.querySelector(".md-send-button");
        if (!sendButton) {
            const buttons = form.querySelector(".buttons-3JBrkn");
            if (!buttons)
                return;
            textArea.addEventListener("input", handleInput);
            sendButton = document.createElement("button");
            sendButton.className = "md-send-button buttonWrapper-1ZmCpA button-38aScr lookBlank-3eh9lL colorBrand-3pXr91 grow-q77ONN";
            sendButton.title = strings.SEND_MESSAGE;
            sendButton.onclick = handleSend;
            sendButton.hidden = true;
            sendButton.innerHTML = `<div class="contents-18-Yxp button-3AYNKb button-318s1X"><svg class="icon-3D60ES" width="24px" height="24px" viewBox="0 0 24 24">
    <path fill="currentColor" d="M21,11c0.488,0,0.905-0.352,0.986-0.833c0.081-0.481-0.198-0.95-0.659-1.11l-18-6.156 C2.93,2.763,2.488,2.89,2.224,3.216C1.959,3.541,1.926,3.999,2.143,4.359l3.693,6.155C6.017,10.815,6.342,11,6.693,11H21z"/>
    <path fill="currentColor" d="M6.693,13c-0.352,0-0.677,0.186-0.857,0.485l-3.694,6.157c-0.217,0.359-0.183,0.818,0.081,1.144 c0.265,0.326,0.706,0.451,1.104,0.314l18-6.155c0.461-0.159,0.74-0.629,0.659-1.11C21.906,13.352,21.489,13,21,13H6.693z"/>
</svg></div>`;
            buttons.appendChild(sendButton);
        }
        const isEmpty = textArea.value == "";
        if (sendButton.hidden != isEmpty) {
            sendButton.hidden = isEmpty;
            for (const button of form.querySelectorAll(".buttonWrapper-1ZmCpA:not(.md-send-button)"))
                button.hidden = !isEmpty;
        }
    }
    function handleInput(event) {
        updateButtons(this);
    }
    const origFocus = HTMLElement.prototype.focus;
    function handleSend(event) {
        event.preventDefault();
        const { currentTarget: { form } } = event;
        const textArea = form.querySelector(".textArea-12jD-V");
        const keyboardEvent = new KeyboardEvent("keypress", {
            bubbles: true,
            key: "Enter",
            keyCode: 13
        });
        if (keyboardEvent.keyCode !== 13)
            Object.defineProperty(keyboardEvent, "keyCode", { value: 13 });
        origFocus.call(textArea);
        const { selectionStart } = textArea;
        textArea.selectionStart = 0;
        textArea.dispatchEvent(keyboardEvent);
        textArea.selectionStart = selectionStart;
    }
    window.addEventListener("keypress", event => {
        if (!event.isTrusted)
            return;
        if (isSendKey(event))
            if (hasTouchKeyboard())
                event.stopImmediatePropagation();
    }, true);

    // dispatch input event before keydown/keyup
    //
    // Edge fires the input event asynchronously, so one or more keyboard events can happen before it.
    // E.g.: keydown, keypress, textInput, keyup, keydown, keypress, textInput, keyup, input
    // For SlateChannelTextArea, Discord stores a copy of the text on input and resets the selection on keydown/keyup.
    // However, if the copy isn't up to date, and the new selection is out of range, the selection gets moved back.
    let inputState = "stable";
    window.addEventListener("textInput", event => {
        if (event.target.matches(".slateTextArea-1Mkdgw"))
            if (!event.defaultPrevented)
                inputState = "pending";
    });
    function updateInput(target) {
        if (inputState == "pending") {
            target.dispatchEvent(new Event("input", { bubbles: true }));
            inputState = "dispatched";
        }
    }
    window.addEventListener("keydown", event => {
        updateInput(event.target);
    }, true);
    window.addEventListener("keyup", event => {
        updateInput(event.target);
    }, true);
    window.addEventListener("input", event => {
        if (inputState == "dispatched")
            event.stopImmediatePropagation();
        inputState = "stable";
    }, true);

    // prevent auto focusing
    // touch keyboard is shown when focusing a text box in touch/tablet mode
    function hasTouchKeyboard() {
        if ("Windows" in self)
            return !new Windows.Devices.Input.KeyboardCapabilities().keyboardPresent;
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
                    ".textArea-12jD-V"
                )) {
                    if (this.matches(".addFriendInput-4bcerK"))
                        if (!(window.event && event.type == "click"))
                            return;
                    break out;
                }
                if (this instanceof HTMLTextAreaElement)
                    updateButtons(this);
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
    HTMLElement.prototype.focus = wrapFocus(HTMLElement.prototype.focus);
    Object.defineProperty(HTMLTextAreaElement.prototype, "selectionStart", { set: wrapFocus(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "selectionStart").set) });
    Object.defineProperty(HTMLTextAreaElement.prototype, "selectionEnd", { set: wrapFocus(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "selectionEnd").set) });

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
            else if (value == "/assets/3d5696326e1a1f22f5025061e6701193.webm")
                arguments[1] = "/assets/md/connecting-light.webm";
        HTMLElement.prototype.setAttribute.apply(this, arguments);
    };

    // insert image placeholders
    // prevents messages from jumping when images load
    function updateImage(wrapper) {
        const { width, height } = wrapper.style;
        let placeholder = wrapper.querySelector(".md-image-placeholder");
        if (placeholder) {
            if (width)
                placeholder.width = parseInt(width, 10);
            if (height)
                placeholder.height = parseInt(height, 10);
        } else {
            placeholder = document.createElement("canvas");
            placeholder.className = "md-image-placeholder";
            placeholder.width = parseInt(width, 10);
            placeholder.height = parseInt(height, 10);
            wrapper.insertBefore(placeholder, wrapper.firstChild);
        }
        wrapper.removeAttribute("style");
    }
    const imageObserver = new MutationObserver((mutations, observer) => {
        for (const { target } of mutations)
            updateImage(target);
        imageObserver.takeRecords();
    });
    function updateImagePlaceholders() {
        for (const wrapper of document.querySelectorAll(".imageWrapper-2p5ogY[style], .embedVideo-3nf0O9[style]"))
            if (wrapper.matches(".embedVideo-3nf0O9 > .imageWrapper-2p5ogY"))
                wrapper.removeAttribute("style");
            else {
                updateImage(wrapper);
                imageObserver.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
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
                const channel = new MessageChannel();
                channel.port1.onmessage = () => {
                    target.dispatchEvent(event);
                    resolve();
                };
                channel.port2.postMessage(undefined);
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
        let selectors = ".friendsEmpty-1K9B4k .wrapper-r-6rrt," +
            ".peopleColumn-29fq28 .scroller-2FKFPG," +
            ".messagesWrapper-3lZDfY," +
            ".noChannel-Z1DQK7 > .wrapper-r-6rrt," +
            ".scrollWrap-qwpLpa," +
            ".layout-1cQCv2";
        if (guild)
            selectors += ", .scroller-1JbKMe, .scroller-2wx7Hm";
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
        const button = element.closest(".iconItem-1-bXkn, .button-14-BFJ");
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
            hideTooltip();
            animateNavigation(event, !(element.closest(".blob-3RT82C") && document.querySelector(".privateChannels-1nO12o")));
            return;
        }
        // animate channel navigation
        const channel = element.closest(".wrapper-1ucjTd, .channel-2QD9_O");
        if (channel) {
            if (element.closest(".wrapper-1ucjTd [role=button], .close-3hZ5Ni"))
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
                document.querySelector(".contentRegionScrollerWrap-3YZXdm").scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "end"
                });
            else if (item.matches(".selected-3s45Ha"))
                document.querySelector(".contentRegion-3nDuYy").scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "start"
                });
            return;
        }

        // scroll to chat when tapping a channel or jump button
        if (element.closest(
            ".modeSelected-1zApJ_," +
            ".jumpButton-Ia2hRJ," +
            ".channelName-1QajIf," +
            ".messageGroupWrapper-o-Zw7G .clickOverride-1J40_l," +
            ".actionButtons-1sUUug .jumpButton-3DTcS_," +
            ".channelName-3kBz6H," +
            ".channel-2QD9_O," +
            ".blob-3RT82C"
        )) {
            if (element.closest(".wrapper-1ucjTd [role=button], .close-3hZ5Ni"))
                return;
            const chat = document.querySelector(
                ".peopleColumn-29fq28," +
                ".chatContent-a9vAAp," +
                ".scrollWrap-qwpLpa," +
                ".activityFeed-1C0EmJ"
            );
            chat.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

    // monkey patch to enable message context menu
    function copy(e) {
        var t = document.body;
        if (null == t)
            throw new Error("[Utils] ClipboardUtils.copy(): assert failed: document.body != null");
        var n = document.createRange(), a = window.getSelection(), i = document.createElement("textarea");
        i.value = e, i.contentEditable = "true", i.style.visibility = "none", t.appendChild(i), n.selectNodeContents(i), a.removeAllRanges(), a.addRange(n), i.focus(), i.setSelectionRange(0, e.length);
        var r = document.execCommand("copy");
        return t.removeChild(i), r;
    }
    window.mdCopy = function (text) {
        if (text)
            copy(text);
        else
            document.execCommand("copy");
    };
    const jsonpArray = window["webpackJsonp"] = window["webpackJsonp"] || [];
    let jsonpPush = jsonpArray.push;
    Object.defineProperty(jsonpArray, "push", {
        configurable: true,
        enumerable: true,
        get() {
            return jsonpPush;
        },
        set(webpackJsonpCallback) {
            jsonpPush = function push([chunkIds, moreModules]) {
                if (jsonpPush == push)
                    for (const moduleId in moreModules) {
                        let module = moreModules[moduleId].toString();
                        if (module.includes('"NativeCopyItem"') || module.includes('"NativeLinkGroup"')) {
                            module = module.replace(/\w+\.default\.embedded\b/, "true");
                            module = module.replace(/\w+\.default\.copy\b/, "mdCopy");
                        } else if (module.includes('"ConnectedMessageGroup"'))
                            module = module.replace(/\w+\.default\.embedded\b/, "true");
                        else
                            continue;
                        moreModules[moduleId] = (0, eval)(`(${module})`);
                    }
                return webpackJsonpCallback.apply(this, arguments);
            };
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
        const messagesPopouts = document.getElementsByClassName("messagesPopout-24nkyi");
        const messagesPopoutObserver = new MutationObserver((mutations, observer) => {
            updateImagePlaceholders();
        });
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
            updateImagePlaceholders();
            for (const messagesPopout of messagesPopouts)
                messagesPopoutObserver.observe(messagesPopout, { childList: true });

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
