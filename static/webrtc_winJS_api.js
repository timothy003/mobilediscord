(function (Promise) {
  "use strict";
  if (!("Org" in window && "WebRtc" in Org))
    return;

  // initialize api
  Org.WebRtc.WinJSHooks.initialize();

  const media = Org.WebRtc.Media.createMedia();
  media.setAudioOutputDevice("default");
  Object.defineProperty(navigator, "userAgent", { value: "AppleWebKit/537.36 Chrome/54.0.2840.59 Safari/537.36" });

  let mediaPlayer = null;
  let deferral = null;
  class PowerSaveBlocker {
    constructor() {
      // use a MediaPlayer to keep the network active
      const mb = new Windows.Media.Core.MediaBinder();
      mb.onbinding = e => {
        deferral = e.getDeferral();
      };
      const ms = Windows.Media.Core.MediaSource.createFromMediaBinder(mb);
      if (!mediaPlayer) {
        mediaPlayer = new Windows.Media.Playback.MediaPlayer();
        mediaPlayer.audioCategory = Windows.Media.Playback.MediaPlayerAudioCategory.gameChat;
        // HACK: network becomes inactive if background playback is killed
        Windows.UI.WebUI.WebUIApplication.addEventListener("resuming", function (e) {
          const source = mediaPlayer.source;
          if (source) {
            mediaPlayer.source = null;
            if (deferral) {
              deferral.complete();
              deferral = null;
            }
            mediaPlayer.source = source;
          }
        });
      }
      mediaPlayer.source = ms;
    }
    close() {
      // Closing the MediaPlayer while an audio stream is active stops the system from suspending the app.
      // As a workaround, keep the MediaPlayer open and just unset its source.
      mediaPlayer.source = null;
      if (deferral) {
        deferral.complete();
        deferral = null;
      }
    }
  }

  // makes own properties enumerable and defines non-enumerable properties on window
  function defineInterface(object, { noInterfaceObject, legacyWindowAlias } = {}) {
    for (const prop of Object.getOwnPropertyNames(object))
      if (prop !== "prototype" && prop !== "name" && prop !== "length")
        Object.defineProperty(object, prop, { enumerable: true });
    for (const prop of Object.getOwnPropertyNames(object.prototype))
      if (prop !== "constructor")
        Object.defineProperty(object.prototype, prop, { enumerable: true });

    if (!noInterfaceObject)
      Object.defineProperty(window, object.name, {
        configurable: true,
        enumerable: false,
        value: object,
        writable: true
      });
    if (legacyWindowAlias)
      Object.defineProperty(window, legacyWindowAlias, {
        configurable: true,
        enumerable: false,
        value: object,
        writable: true
      });
  }

  // polyfill DOMException constructor
  const DOMException = new Proxy(window.DOMException, {
    construct(target, argumentsList, newTarget) {
      const [message = "", name = "Error"] = argumentsList;
      const e = Reflect.construct(Error, [message], newTarget);
      Object.defineProperty(e, "name", {
        configurable: true,
        value: String(name),
        writable: true
      });
      return e;
    }
  });
  DOMException.prototype.constructor = DOMException;
  const origCode = Object.getOwnPropertyDescriptor(DOMException.prototype, "code").get;
  Object.defineProperty(DOMException.prototype, "code", {
    get() {
      if (!this.hasOwnProperty("name"))
        return origCode.call(this);
      // legacy error codes from https://heycam.github.io/webidl/#idl-DOMException-error-names
      return {
        IndexSizeError: 1,
        DOMStringSizeError: 2,
        HierarchyRequestError: 3,
        WrongDocumentError: 4,
        InvalidCharacterError: 5,
        NoDataAllowedError: 6,
        NoModificationAllowedError: 7,
        NotFoundError: 8,
        NotSupportedError: 9,
        InUseAttributeError: 10,
        InvalidStateError: 11,
        SyntaxError: 12,
        InvalidModificationError: 13,
        NamespaceError: 14,
        InvalidAccessError: 15,
        ValidationError: 16,
        TypeMismatchError: 17,
        SecurityError: 18,
        NetworkError: 19,
        AbortError: 20,
        URLMismatchError: 21,
        QuotaExceededError: 22,
        TimeoutError: 23,
        InvalidNodeTypeError: 24,
        DataCloneError: 25
      }[this.name] || 0;
    }
  });
  const origToString = DOMException.prototype.toString;
  DOMException.prototype.toString = function toString() {
    if (!this.hasOwnProperty("name"))
      return origToString.call(this);
    return this.name + ": " + this.message;
  };
  window.DOMException = DOMException;

  class EventTarget {
    constructor() {
      this._eventTarget = document.createDocumentFragment();
      this._eventHandlerListener = event => {
        const callback = this._eventHandlers[event.type];
        if (callback == null)
          return;
        if (!callback.call(this, event))
          event.preventDefault();
      };
      this._eventHandlers = {};
    }
    addEventListener(type, callback, options = undefined) {
      return this._eventTarget.addEventListener(...arguments);
    }
    removeEventListener(type, callback, options = undefined) {
      return this._eventTarget.removeEventListener(...arguments);
    }
    dispatchEvent(event) {
      return this._eventTarget.dispatchEvent(...arguments);
    }
  }
  defineInterface(EventTarget, { noInterfaceObject: true });

  function defineEventHandlers(prototype, types) {
    for (const type of types)
      Object.defineProperty(prototype, "on" + type, {
        configurable: true,
        enumerable: true,
        get() {
          return this._eventHandlers[type] || null;
        },
        set(value) {
          if (value != null)
            this.addEventListener(type, this._eventHandlerListener);
          this._eventHandlers[type] = value;
        }
      });
  }

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/mediastream/MediaStream.idl

  class MediaStream extends EventTarget {
    constructor() {
      super();
      if (arguments[0] instanceof Org.WebRtc.MediaStream)
        this._nativeStream = arguments[0];
      else {
        this._nativeStream = new Org.WebRtc.MediaStream();
        if (arguments.length >= 1) {
          let tracks;
          if (arguments[0] instanceof MediaStream)
            tracks = arguments[0]._nativeStream.getTracks();
          else
            tracks = arguments[0];
          for (const track of tracks)
            this._nativeStream.addTrack(track);
        }
      }
    }
    get id() {
      return this._nativeStream.id;
    }
    getAudioTracks() {
      return this._nativeStream.getAudioTracks();
    }
    getVideoTracks() {
      return this._nativeStream.getVideoTracks();
    }
    getTracks() {
      return this._nativeStream.getTracks();
    }
    getTrackById(trackId) {
      return this._nativeStream.getTrackById(trackId);
    }
    addTrack(track) {
      return this._nativeStream.addTrack(track);
    }
    removeTrack(track) {
      return this._nativeStream.removeTrack(track);
    }
    clone() {
      // TODO
      return new MediaStream();
    }
    get active() {
      return this._nativeStream.active;
    }
  }
  // TODO
  // defineEventHandlers(MediaStream.prototype, [
  //   "addtrack",
  //   "removetrack"
  //   "active",
  //   "inactive",
  // ]);
  defineInterface(MediaStream, { legacyWindowAlias: "webkitMediaStream" });

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/mediastream/MediaStreamEvent.idl

  class MediaStreamEvent extends Event {
    constructor(type, eventInitDict = undefined) {
      super(...arguments);
      this.stream = Object(eventInitDict).stream || null;
    }
  }
  defineInterface(MediaStreamEvent);

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/mediastream/MediaDevices.idl

  navigator.mediaDevices.enumerateDevices = function enumerateDevices() {
    return Promise.resolve(media.enumerateDevices());
  };

  function createMediaConstraints(constraints) {
    const result = new Org.WebRtc.MediaTrackConstraints;
    if ("optional" in constraints || "mandatory" in constraints) {
      if ("mandatory" in constraints)
        for (const key in constraints.mandatory)
          result.addMandatory(key, constraints.mandatory[key]);
      if ("optional" in constraints)
        for (const constraint of constraints.optional)
          for (const key in constraint)
            result.addOptional(key, constraint[key]);
    } else
      for (const key in constraints)
        result[key] = constraints[key];
    return result;
  }

  const { StreamingCaptureMode } = Windows.Media.Capture;

  function CaptureMode(audio, video) {
    if (audio)
      if (video)
        return StreamingCaptureMode.audioAndVideo;
      else
        return StreamingCaptureMode.audio;
    else
      return StreamingCaptureMode.video;
  }

  const capturePromises = [null, null, null];
  let lastCapturePromise = null;
  const getUserMediaPromise = function getUserMedia(constraints = undefined) {
    return new Promise((resolve, reject) => {
      constraints = Object(constraints);
      const nativeConstraints = new Org.WebRtc.RTCMediaStreamConstraints();
      nativeConstraints.audioEnabled = constraints.audio;
      nativeConstraints.videoEnabled = constraints.video;
      if (typeof constraints.audio === "object")
        nativeConstraints.audio = createMediaConstraints(constraints.audio);
      if (typeof constraints.video === "object")
        nativeConstraints.video = createMediaConstraints(constraints.video);

      // ask for permission to access microphone/camera
      const audio = nativeConstraints.audioEnabled && !capturePromises[StreamingCaptureMode.audio];
      const video = nativeConstraints.videoEnabled && !capturePromises[StreamingCaptureMode.video];
      if (audio || video) {
        const requestPermission = () => {
          const captureInitSettings = new Windows.Media.Capture.MediaCaptureInitializationSettings();
          captureInitSettings.streamingCaptureMode = CaptureMode(audio, video);
          const mediaCapture = new Windows.Media.Capture.MediaCapture();
          return mediaCapture.initializeAsync(captureInitSettings).then(() => {
            mediaCapture.close();
          }, e => {
            throw new DOMException(e.message, "PermissionDeniedError");
          });
        };
        lastCapturePromise = lastCapturePromise ? lastCapturePromise.then(requestPermission, requestPermission) : requestPermission();
        if (audio)
          capturePromises[StreamingCaptureMode.audio] = lastCapturePromise;
        if (video)
          capturePromises[StreamingCaptureMode.video] = lastCapturePromise;
        if (capturePromises[StreamingCaptureMode.audio] && capturePromises[StreamingCaptureMode.video])
          capturePromises[StreamingCaptureMode.audioAndVideo] = Promise.all(capturePromises);
      }
      resolve(capturePromises[CaptureMode(nativeConstraints.audioEnabled, nativeConstraints.videoEnabled)].then(() => media.getUserMedia(nativeConstraints)).then(nativeStream => new MediaStream(nativeStream)));
    });
  };
  navigator.mediaDevices.getUserMedia = getUserMediaPromise;

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/mediastream/NavigatorMediaStream.idl

  function getUserMedia(constraints, successCallback, errorCallback) {
    getUserMediaPromise(constraints).then(successCallback, errorCallback);
  }
  navigator.getUserMedia = getUserMedia;
  navigator.webkitGetUserMedia = function webkitGetUserMedia(constraints, successCallback, errorCallback) {
    return getUserMedia(...arguments);
  };

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/peerconnection/RTCIceCandidate.idl

  function createNativeIceCandidate(candidateInitDict) {
    const { candidate = "", sdpMid = "", sdpMLineIndex } = Object(candidateInitDict);
    return new Org.WebRtc.RTCIceCandidate(candidate, sdpMid, sdpMLineIndex);
  }

  class RTCIceCandidate {
    constructor(candidateInitDict) {
      if (candidateInitDict instanceof Org.WebRtc.RTCIceCandidate)
        this._nativeCandidate = candidateInitDict;
      else
        this._nativeCandidate = createNativeIceCandidate(candidateInitDict);
    }
    get candidate() {
      return this._nativeCandidate.candidate;
    }
    set candidate(candidate) {
      this._nativeCandidate.candidate = candidate;
    }
    get sdpMid() {
      return this._nativeCandidate.sdpMid;
    }
    set sdpMid(sdpMid) {
      this._nativeCandidate.sdpMid = sdpMid;
    }
    get sdpMLineIndex() {
      return this._nativeCandidate.sdpMLineIndex;
    }
    set sdpMLineIndex(sdpMLineIndex) {
      this._nativeCandidate.sdpMLineIndex = sdpMLineIndex;
    }
    toJSON() {
      const { candidate, sdpMid, sdpMLineIndex } = this._nativeCandidate;
      return { candidate, sdpMid, sdpMLineIndex };
    }
  }
  defineInterface(RTCIceCandidate);

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/peerconnection/RTCPeerConnectionIceEvent.idl

  class RTCPeerConnectionIceEvent extends Event {
    constructor(type, eventInitDict = undefined) {
      super(...arguments);
      this.candidate = Object(eventInitDict).candidate || null;
    }
  }
  defineInterface(RTCPeerConnectionIceEvent);

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/peerconnection/RTCSessionDescription.idl

  function createNativeSessionDescription(descriptionInitDict) {
    const { type, sdp = "" } = Object(descriptionInitDict);
    return new Org.WebRtc.RTCSessionDescription(Org.WebRtc.RTCSdpType[type], sdp);
  }

  class RTCSessionDescription {
    constructor(descriptionInitDict = undefined) {
      if (descriptionInitDict instanceof Org.WebRtc.RTCSessionDescription)
        this._nativeDescription = descriptionInitDict;
      else
        this._nativeDescription = createNativeSessionDescription(descriptionInitDict);
    }
    get type() {
      return [
        "offer",
        "pranswer",
        "answer"
      ][this._nativeDescription.type];
    }
    set type(type) {
      this._nativeDescription.type = Org.WebRtc.RTCSdpType[type];
    }
    get sdp() {
      return this._nativeDescription.sdp;
    }
    set sdp(sdp) {
      this._nativeDescription.sdp = sdp;
    }
    toJSON() {
      const { type, sdp } = this;
      return { type, sdp };
    }
  }
  defineInterface(RTCSessionDescription);

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/peerconnection/RTCDataChannelEvent.idl

  class RTCDataChannelEvent extends Event {
    constructor(type, eventInitDict) {
      super(...arguments);
      this.channel = Object(eventInitDict).channel;
    }
  }
  defineInterface(RTCDataChannelEvent);

  function attachMediaStream(element, stream) {
    if (stream.getVideoTracks().length > 0) {
      const videoTrack = stream.getVideoTracks().first().current;
      var streamSource = media.createMediaSource(videoTrack, stream.id);
      var mediaSource = Windows.Media.Core.MediaSource.createFromIMediaSource(streamSource);
      var mediaPlaybackItem = new Windows.Media.Playback.MediaPlaybackItem(mediaSource);
      var playlist = new Windows.Media.Playback.MediaPlaybackList();
      playlist.items.append(mediaPlaybackItem);
      element.msRealTime = true;
      element.src = URL.createObjectURL(playlist, { oneTimeOnly: true });
    }
  }

  // https://chromium.googlesource.com/chromium/src.git/+/56.0.2924.87/third_party/WebKit/Source/modules/peerconnection/RTCPeerConnection.idl

  const {
    RTCIceTransportPolicy,
    RTCBundlePolicy,
    RTCSignalingState,
    RTCIceGatheringState,
    RTCIceConnectionState
  } = Org.WebRtc;

  function throwExceptionIfSignalingStateClosed(state) {
    if (state == RTCSignalingState.closed)
      throw new DOMException("The RTCPeerConnection's signalingState is 'closed'.", "InvalidStateError");
  }

  function convertToRTCOfferAnswerOptions(options) {
    const nativeOptions = new Org.WebRtc.RTCOfferAnswerOptions();
    for (const key in options)
      if (nativeOptions[key] !== undefined)
        nativeOptions[key] = options[key];
    return nativeOptions;
  }

  let numOpenConnections = 0;
  let powerSaveBlocker = null;
  let audioContext = null;
  class RTCPeerConnection extends EventTarget {
    constructor(configuration = undefined, mediaConstraints = undefined) {
      //Todo: do we need to implement mediaConstraints in C++/CX API?
      configuration = Object(configuration);

      const iceTransportPolicy = {
        "none": RTCIceTransportPolicy.none,
        "relay": RTCIceTransportPolicy.relay,
        "all": RTCIceTransportPolicy.all
      }[configuration.iceTransportPolicy || configuration.iceTransports];

      const bundlePolicy = {
        "balanced": RTCBundlePolicy.balanced,
        "max-bundle": RTCBundlePolicy.maxBundle,
        "max-compat": RTCBundlePolicy.maxCompat
      }[configuration.bundlePolicy];

      const nativeConfig = new Org.WebRtc.RTCConfiguration();
      nativeConfig.iceTransportPolicy = iceTransportPolicy;
      nativeConfig.bundlePolicy = bundlePolicy;

      if (configuration.iceServers !== undefined) {
        const iceServers = [];
        for (const iceServer of configuration.iceServers) {
          let { urls, url, username = "", credential = "" } = Object(iceServer);
          if (urls !== undefined) {
            if (typeof urls === "string")
              urls = [urls];
          } else if (url !== undefined) {
            urls = [url];
          } else
            throw new TypeError("Malformed RTCIceServer");

          for (const url of urls) {
            const server = new Org.WebRtc.RTCIceServer();
            server.url = url;
            server.username = username;
            server.credential = credential;
            iceServers.push(server);
          }
        }
        nativeConfig.iceServers = iceServers;
      }

      super();
      this._signalingState = RTCSignalingState.stable;
      this._iceGatheringState = RTCIceGatheringState.new;
      this._iceConnectionState = RTCIceConnectionState.new;
      this._localStreams = [];
      this._remoteStreams = [];

      const nativePC = this._nativePC = new Org.WebRtc.RTCPeerConnection(nativeConfig);
      nativePC.onnegotiationneeded = this._handleNegotiationNeeded.bind(this);
      nativePC.onicecandidate = this._handleIceCandidate.bind(this);
      nativePC.onsignalingstatechange = this._handleSignalingStateChange.bind(this);
      nativePC.onicegatheringstatechange = this._handleIceGatheringStateChange.bind(this);
      nativePC.oniceconnectionstatechange = this._handleIceConnectionStateChange.bind(this);
      nativePC.onaddstream = this._handleAddStream.bind(this);
      nativePC.onremovestream = this._handleRemoveStream.bind(this);
      nativePC.ondatachannel = this._handleDataChannel.bind(this);

      if (numOpenConnections == 0) {
        powerSaveBlocker = new PowerSaveBlocker();
        if (audioContext)
          audioContext.resume();
      }
      ++numOpenConnections;
    }
    createOffer(options = undefined) {
      return new Promise((resolve, reject) => {
        throwExceptionIfSignalingStateClosed(this._signalingState);
        const nativeOptions = convertToRTCOfferAnswerOptions(options);
        resolve(this._nativePC.createOffer(nativeOptions).then(function (offerSDP) {
          // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
          // fully implemented.
          offerSDP.sdp = offerSDP.sdp.replace(" VP9/", " VP8/");
          offerSDP.sdp = offerSDP.sdp.replace(" H264/", " VP8/");
          return new RTCSessionDescription(offerSDP);
        }));
      });
    }
    createAnswer(options = undefined) {
      return new Promise((resolve, reject) => {
        throwExceptionIfSignalingStateClosed(this._signalingState);
        const nativeOptions = convertToRTCOfferAnswerOptions(options);
        resolve(this._nativePC.createAnswer(nativeOptions).then(function (answerSDP) {
          // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
          // fully implemented.
          answerSDP.sdp = answerSDP.sdp.replace(" VP9/", " VP8/");
          answerSDP.sdp = answerSDP.sdp.replace(" H264/", " VP8/");
          return new RTCSessionDescription(answerSDP);
        }));
      });
    }
    setLocalDescription(description) {
      return new Promise((resolve, reject) => {
        throwExceptionIfSignalingStateClosed(this._signalingState);
        const nativeDescription = createNativeSessionDescription(description);
        resolve(this._nativePC.setLocalDescription(nativeDescription));
      });
    }
    get localDescription() {
      const nativeSessionDescription = this._nativePC.localDescription;
      if (nativeSessionDescription == null)
        return null;
      return new RTCSessionDescription(nativeSessionDescription);
    }
    setRemoteDescription(description) {
      return new Promise((resolve, reject) => {
        throwExceptionIfSignalingStateClosed(this._signalingState);
        // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
        // fully implemented.
        const nativeDescription = createNativeSessionDescription(description);
        nativeDescription.sdp = description.sdp.replace(' 101 100', ' 100 101');
        resolve(this._nativePC.setRemoteDescription(nativeDescription));
      });
    }
    get remoteDescription() {
      const nativeSessionDescription = this._nativePC.remoteDescription;
      if (nativeSessionDescription == null)
        return null;
      return new RTCSessionDescription(nativeSessionDescription);
    }
    // getConfiguration() {
    //   return this._nativePC.getConfiguration();
    // }
    getLocalStreams() {
      return this._localStreams.slice();
    }
    getRemoteStreams() {
      return this._remoteStreams.slice();
    }
    getStreamById(streamId) {
      for (const stream of this._localStreams)
        if (stream._nativeStream.id == streamId)
          return stream;
      for (const stream of this._remoteStreams)
        if (stream._nativeStream.id == streamId)
          return stream;
      return null;
    }
    addStream(stream, mediaConstraints = undefined) {
      if (!(stream instanceof MediaStream))
        throw new TypeError("parameter 1 is not of type 'MediaStream'.");
      throwExceptionIfSignalingStateClosed(this._signalingState);
      if (this._localStreams.indexOf(stream) != -1)
        return;
      this._localStreams.push(stream);
      return this._nativePC.addStream(stream._nativeStream);
    }
    removeStream(stream) {
      if (!(stream instanceof MediaStream))
        throw new TypeError("parameter 1 is not of type 'MediaStream'.");
      throwExceptionIfSignalingStateClosed(this._signalingState);
      const pos = this._localStreams.indexOf(stream);
      if (pos == -1)
        return;
      // FIXME: no audio input after removing and re-adding audio track on a new stream
      // this._localStreams.splice(pos, 1);
      // return this._nativePC.removeStream(stream._nativeStream);
    }
    createDataChannel(label, options = undefined) {
      throwExceptionIfSignalingStateClosed(this._signalingState);
      return this._nativePC.createDataChannel(label, options);
    }
    addIceCandidate(candidate) {
      return new Promise((resolve, reject) => {
        throwExceptionIfSignalingStateClosed(this._signalingState);
        const nativeCandidate = createNativeIceCandidate(candidate);
        resolve(this._nativePC.addIceCandidate(nativeCandidate));
      });
    }
    get signalingState() {
      return [
        "stable",
        "have-local-offer",
        "have-local-pranswer",
        "have-remote-offer",
        "have-remote-pranswer",
        "closed"
      ][this._signalingState];
    }
    get iceGatheringState() {
      return [
        "new",
        "gathering",
        "complete"
      ][this._iceGatheringState];
    }
    get iceConnectionState() {
      return [
        "new",
        "checking",
        "connected",
        "completed",
        "failed",
        "disconnected",
        "closed"
      ][this._iceConnectionState];
    }
    close() {
      throwExceptionIfSignalingStateClosed(this._signalingState);

      this._nativePC.close();

      this._changeIceConnectionState(RTCIceConnectionState.closed);
      this._changeIceGatheringState(RTCIceGatheringState.complete);
      this._changeSignalingState(RTCSignalingState.closed);

      if (--numOpenConnections == 0) {
        powerSaveBlocker.close();
        powerSaveBlocker = null;
        // pause audio context to allow app suspension
        if (audioContext)
          audioContext.suspend();
      }
    }
    getStats(selector = undefined) {
      return new Promise((resolve, reject) => {
        // this._nativePC.addEventListener("rtcstatsreportsready", function onrtcstatsreportsready(event) {
        //   this.removeEventListener("rtcstatsreportsready", onrtcstatsreportsready);
        //   this.rtcStatsEnabled = false;
        //   resolve(event.rtcStatsReports);
        // });
        // this._nativePC.rtcStatsEnabled = true;
      });
    }
    createDTMFSender(track) {
      throw new DOMException("DTMF is not implemented in WebRTC for UWP.", "NotSupportedError");
    }
    _handleNegotiationNeeded(eventArgs) {
      this._scheduleDispatchEvent(new Event("negotiationneeded"));
    }
    _handleIceCandidate(eventArgs) {
      const nativeCandidate = eventArgs.candidate;
      if (nativeCandidate == null)
        this._scheduleDispatchEvent(new RTCPeerConnectionIceEvent("icecandidate", { candidate: null }));
      else {
        const candidate = new RTCIceCandidate(nativeCandidate);
        this._scheduleDispatchEvent(new RTCPeerConnectionIceEvent("icecandidate", { candidate }));
      }
    }
    _handleSignalingStateChange(eventArgs) {
      this._changeSignalingState(this._nativePC.signalingState);
    }
    _handleIceGatheringStateChange(eventArgs) {
      this._changeIceGatheringState(this._nativePC.iceGatheringState);
    }
    _handleIceConnectionStateChange(eventArgs) {
      this._changeIceConnectionState(eventArgs.state);
    }
    _handleAddStream(eventArgs) {
      if (this._signalingState == RTCSignalingState.closed)
        return;
      const stream = new MediaStream(eventArgs.stream);
      this._remoteStreams.push(stream);
      this._scheduleDispatchEvent(new MediaStreamEvent("addstream", { stream }));
    }
    _handleRemoveStream(eventArgs) {
      if (this._signalingState == RTCSignalingState.closed)
        return;
      const id = eventArgs.stream.id;
      const pos = this._remoteStreams.findIndex(stream => stream._nativeStream.id == id);
      console.assert(pos != -1);
      const [stream] = this._remoteStreams.splice(pos, 1);
      this._scheduleDispatchEvent(new MediaStreamEvent("removestream", { stream }));
    }
    _handleDataChannel(eventArgs) {
      if (this._signalingState == RTCSignalingState.closed)
        return;
      this._scheduleDispatchEvent(new RTCDataChannelEvent("datachannel", { channel: eventArgs.channel }));
    }
    _changeSignalingState(signalingState) {
      if (this._signalingState != RTCSignalingState.closed && this._signalingState != signalingState) {
        this._signalingState = signalingState;
        this._scheduleDispatchEvent(new Event("signalingstatechange"));
      }
    }
    _changeIceGatheringState(iceGatheringState) {
      this._iceGatheringState = iceGatheringState;
    }
    _changeIceConnectionState(iceConnectionState) {
      if (this._iceConnectionState != RTCIceConnectionState.closed)
        this._scheduleDispatchEvent(new Event("iceconnectionstatechange"), () => {
          if (this._iceConnectionState != RTCIceConnectionState.closed && this._iceConnectionState != iceConnectionState) {
            this._iceConnectionState = iceConnectionState;
            return true;
          }
          return false;
        });
    }
    _scheduleDispatchEvent(event, setupFunction = null) {
      setImmediate(() => {
        if (!setupFunction || setupFunction())
          this._eventTarget.dispatchEvent(event);
      });
    }
  }
  defineEventHandlers(RTCPeerConnection.prototype, [
    "negotiationneeded",
    "icecandidate",
    "signalingstatechange",
    "iceconnectionstatechange",
    // "icegatheringstatechange",
    "datachannel",
    "addstream",
    "removestream"
  ]);
  defineInterface(RTCPeerConnection, { legacyWindowAlias: "webkitRTCPeerConnection" });

  const objectURLs = new Map();

  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    if (object instanceof MediaStream) {
      const url = "webrtc:" + object._nativeStream.id;
      objectURLs.set(url, object);
      return url;
    }
    return origCreateObjectURL.apply(this, arguments);
  };
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url) {
    if (url.startsWith("webrtc:")) {
      objectURLs.delete(url);
      return;
    }
    return origRevokeObjectURL.apply(this, arguments);
  };

  if ("setVolume" in Org.WebRtc.MediaAudioTrack.prototype)
    for (const p of ["muted", "volume"]) {
      const origSet = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, p).set;
      Object.defineProperty(HTMLMediaElement.prototype, p, {
        set(value) {
          origSet.call(this, value);

          let stream = this._srcMediaStream;
          if (!stream && this.src.startsWith("webrtc:"))
            stream = objectURLs.get(this.src);
          if (!stream)
            return;
          for (const track of stream._nativeStream.getAudioTracks())
            track.setVolume(this.muted ? 0 : this.volume);
        }
      });
    }

  HTMLMediaElement.prototype.setSinkId = function setSinkId(sinkId) {
    return Promise.resolve(media.setAudioOutputDevice(sinkId));
  };
  AudioContext.prototype.createMediaStreamSource = function createMediaStreamSource(mediaStream) {
    audioContext = this;
    if (!numOpenConnections)
      this.suspend();
    const osc = this.createOscillator();
    osc.start();
    return osc;
  };
  const origSrcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject").set;
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    set(value) {
      if (value instanceof MediaStream) {
        attachMediaStream(this, value._nativeStream);
        this._srcMediaStream = value;
        return;
      } else if (this._srcMediaStream) {
        this._srcMediaStream = null;
        this.removeAttribute("src");
        this.msRealTime = false;
      }
      if (value === undefined)
        value = null;
      origSrcObject.call(this, value);
    }
  });
})(Promise);
