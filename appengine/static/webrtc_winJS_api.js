(function (Promise) {
  "use strict";
  if (!("Org" in self && "WebRtc" in Org))
    return;

  function copy(target, source) {
    for (const key in source)
      target[key] = source[key];
    return target;
  }

  // initialize api
  Org.WebRtc.WinJSHooks.initialize();

  const media = Org.WebRtc.Media.createMedia();
  media.setAudioOutputDevice("default");
  Object.defineProperty(navigator, "userAgent", { value: "AppleWebKit/537.36 Chrome/54.0.2840.59 Safari/537.36" });

  MediaStream = Org.WebRtc.MediaStream;

  navigator.mediaDevices.enumerateDevices = function () {
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
      copy(result, constraints);
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

  class PermissionDeniedError extends Error {
    constructor(message) {
      super(message);
      this.name = "PermissionDeniedError";
    }
  }

  const capturePromises = [null, null, null];
  let lastCapturePromise = null;
  navigator.mediaDevices.getUserMedia = function (constraints) {
    return new Promise((resolve, reject) => {
      var constraintsOverride = new Org.WebRtc.RTCMediaStreamConstraints();
      constraintsOverride.audioEnabled = constraints.audio;
      constraintsOverride.videoEnabled = constraints.video;
      if (typeof constraints.audio === "object")
        constraintsOverride.audio = createMediaConstraints(constraints.audio);
      if (typeof constraints.video === "object")
        constraintsOverride.video = createMediaConstraints(constraints.video);

      // ask for permission to access microphone/camera
      const audio = constraintsOverride.audioEnabled && !capturePromises[StreamingCaptureMode.audio];
      const video = constraintsOverride.videoEnabled && !capturePromises[StreamingCaptureMode.video];
      if (audio || video) {
        const requestPermission = () => {
          const captureInitSettings = new Windows.Media.Capture.MediaCaptureInitializationSettings();
          captureInitSettings.streamingCaptureMode = CaptureMode(audio, video);
          const mediaCapture = new Windows.Media.Capture.MediaCapture();
          return mediaCapture.initializeAsync(captureInitSettings).then(() => {
            mediaCapture.close();
          }, e => {
            console.error("Failed to obtain media access permission:", e.message);
            throw new PermissionDeniedError;
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
      resolve(capturePromises[CaptureMode(constraintsOverride.audioEnabled, constraintsOverride.videoEnabled)].then(() => media.getUserMedia(constraintsOverride)));
    });
  };
  navigator.getUserMedia = function (constraints, successCallback, errorCallback) {
    navigator.mediaDevices.getUserMedia(constraints).then(successCallback, errorCallback);
  };

  self.RTCIceCandidate = function (candidate) {
    if (candidate !== undefined) {
      this.candidate = candidate.candidate;
      this.sdpMid = candidate.sdpMid;
      this.sdpMLineIndex = candidate.sdpMLineIndex;
    }
  };

  self.RTCSessionDescription = function (message) {
    var sdpType;
    if (message.type == 'offer') {
      sdpType = Org.WebRtc.RTCSdpType.offer;
    }
    else if (message.type == 'answer') {
      sdpType = Org.WebRtc.RTCSdpType.answer;
    }
    else {
      sdpType = Org.WebRtc.RTCSdpType.pranswer;
    }
    return new Org.WebRtc.RTCSessionDescription(sdpType, message.sdp);
  };

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

  function convertToRTCOfferAnswerOptions(options) {
    const result = copy(new Org.WebRtc.RTCOfferAnswerOptions, options);
    const optionKeys = {
      OfferToReceiveAudio: "offerToReceiveAudio",
      OfferToReceiveVideo: "offerToReceiveVideo",
      VoiceActivityDetection: "voiceActivityDetection",
      IceRestart: "iceRestart"
    };
    for (const key in options.mandatory)
      result[optionKeys[key]] = options.mandatory[key];
    if ("optional" in options)
      for (const constraint of options.optional)
        for (const key in constraint)
          result[optionKeys[key]] = constraint[key];
    return result;
  }

  let numOpenConnections = 0;
  let audioContext = null;
  let mediaPlayer = null;
  class RTCPeerConnection {
    constructor(pcConfig, pcConstraints) {
      //Todo: do we need to implement pcConstraints in C++/CX API?
      var winrtConfig = new Org.WebRtc.RTCConfiguration();
      if (pcConfig.iceServers && pcConfig.iceServers.length > 0) {
        var iceServer = new Org.WebRtc.RTCIceServer();
        if (pcConfig.iceServers[0].urls != null) {
          iceServer.url = pcConfig.iceServers[0].urls[0];
        } else {
          iceServer.url = pcConfig.iceServers[0].url;
        }
        iceServer.credential = pcConfig.iceServers[0].credential;
        iceServer.username = pcConfig.iceServers[0].username;
        winrtConfig.iceServers = [];
        winrtConfig.iceServers.push(iceServer);

      }

      this._nativePC = new Org.WebRtc.RTCPeerConnection(winrtConfig);
      // background audio
      if (numOpenConnections == 0) {
        // use a MediaStreamSource to keep the network active
        const audioProps = Windows.Media.MediaProperties.AudioEncodingProperties.createPcm(16000, 1, 16);
        const audioDescriptor = new Windows.Media.Core.AudioStreamDescriptor(audioProps);
        const mss = new Windows.Media.Core.MediaStreamSource(audioDescriptor);
        mss.bufferTime = 0;
        let deferral = null;
        let timeOffset = 0;
        const sampleSize = 1920;
        const sampleDuration = 60;
        mss.onsamplerequested = e => {
          // generate samples until playback starts
          if (mediaPlayer.playbackSession.playbackState === Windows.Media.Playback.MediaPlaybackState.playing)
            deferral = e.request.getDeferral();
          else {
            const buffer = new Windows.Storage.Streams.Buffer(sampleSize);
            buffer.length = sampleSize;
            const sample = Windows.Media.Core.MediaStreamSample.createFromBuffer(buffer, timeOffset);
            sample.duration = sampleDuration;
            sample.keyFrame = true;
            timeOffset = timeOffset + sampleDuration;
            e.request.sample = sample;
          }
        };
        mss.onclosed = e => {
          e.target.onsamplerequested = null;
          e.target.onclosed = null;
          if (deferral)
            deferral.complete();
        };
        if (!mediaPlayer) {
          mediaPlayer = new Windows.Media.Playback.MediaPlayer();
          mediaPlayer.audioCategory = Windows.Media.Playback.MediaPlayerAudioCategory.gameChat;
          mediaPlayer.isMuted = true;
          mediaPlayer.autoPlay = true;
        }
        mediaPlayer.source = Windows.Media.Core.MediaSource.createFromMediaStreamSource(mss);
        if (audioContext)
          audioContext.resume();
      }
      ++numOpenConnections;
    }
    createOffer(...args) {
      let options = null;
      if (args.length > 0 && typeof args[0] === "object")
        options = args[0];
      else if (args.length > 2)
        options = args[2];
      const p = new Promise((resolve, reject) => {
        var winrtOptions = options ? convertToRTCOfferAnswerOptions(options) : null;
        resolve(this._nativePC.createOffer(winrtOptions).then(function (offerSDP) {
          var newOfferSDP = {};
          // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
          // fully implemented.
          newOfferSDP.sdp = offerSDP.sdp.replace(' 101 100', ' 100 101');
          switch (offerSDP.type) {
            case 0: newOfferSDP.type = 'offer'; break;
            case 1: newOfferSDP.type = 'pranswer'; break;
            case 2: newOfferSDP.type = 'answer'; break;
            default: throw 'invalid offer type';
          }
          return newOfferSDP;
        }));
      });
      if (args.length > 0 && typeof args[0] === "function") {
        p.then(args[0], args[1]);
        return Promise.resolve(undefined);
      } else
        return p;
    }
    createAnswer(...args) {
      let options = null;
      if (args.length > 0 && typeof args[0] === "object")
        options = args[0];
      else if (args.length > 2)
        options = args[2];
      const p = new Promise((resolve, reject) => {
        var winrtOptions = options ? convertToRTCOfferAnswerOptions(options) : null;
        resolve(this._nativePC.createAnswer(winrtOptions).then(function (answerSDP) {
          var newAnswerSDP = {};
          // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
          // fully implemented.
          newAnswerSDP.sdp = answerSDP.sdp.replace(' 101 100', ' 100 101');
          switch (answerSDP.type) {
            case 0: newAnswerSDP.type = 'offer'; break;
            case 1: newAnswerSDP.type = 'pranswer'; break;
            case 2: newAnswerSDP.type = 'answer'; break;
            default: throw 'invalid offer type';
          }
          return newAnswerSDP;
        }));
      });
      if (args.length > 0 && typeof args[0] === "function") {
        p.then(args[0], args[1]);
        return Promise.resolve(undefined);
      } else
        return p;
    }
    setLocalDescription(desc) {
      return new Promise((resolve, reject) => {
        var winrtSDP = new RTCSessionDescription(desc);
        resolve(this._nativePC.setLocalDescription(winrtSDP));
      });
    }
    get localDescription() {
      return this._nativePC.localDescription;
    }
    setRemoteDescription(desc) {
      return new Promise((resolve, reject) => {
        // HACK: This is a hack to force VP8 while we're waiting for VP9 to be
        // fully implemented.
        var winrtSDP = desc;
        winrtSDP.sdp = desc.sdp.replace(' 101 100', ' 100 101');
        resolve(this._nativePC.setRemoteDescription(winrtSDP));
      });
    }
    get remoteDescription() {
      return this._nativePC.remoteDescription;
    }
    getConfiguration() {
      return this._nativePC.getConfiguration();
    }
    getLocalStreams() {
      return this._nativePC.getLocalStreams();
    }
    getRemoteStreams() {
      return this._nativePC.getRemoteStreams();
    }
    getStreamById(id) {
      return this._nativePC.getStreamById(id);
    }
    addStream(stream) {
      return this._nativePC.addStream(stream);
    }
    removeStream(stream) {
      return this._nativePC.removeStream(stream);
    }
    createDataChannel(label, init) {
      return this._nativePC.createDataChannel(label, init);
    }
    addIceCandidate(candidate) {
      return new Promise((resolve, reject) => {
        var nativeCandidate = new Org.WebRtc.RTCIceCandidate(candidate.candidate,
          (typeof candidate.sdpMid !== 'undefined') ? candidate.sdpMid : '', candidate.sdpMLineIndex);
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
      ][this._nativePC.signalingState];
    }
    get iceGatheringState() {
      return [
        "new",
        "gathering",
        "complete"
      ][this._nativePC.iceGatheringState];
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
      ][this._nativePC.iceConnectionState];
    }
    close() {
      this._nativePC.close();
      if (--numOpenConnections == 0) {
        // Closing the MediaPlayer while an audio stream is active stops the system from suspending the app.
        // As a workaround, hold on to the MediaPlayer and just release the MediaSource.
        mediaPlayer.source = null;
        // pause audio context to allow app suspension
        if (audioContext)
          audioContext.suspend();
      }
    }
    getStats() {
      return new Promise((resolve, reject) => {
        // this._nativePC.addEventListener("rtcstatsreportsready", function onrtcstatsreportsready(event) {
        //   this.removeEventListener("rtcstatsreportsready", onrtcstatsreportsready);
        //   this._nativePC.rtcStatsEnabled = false;
        //   resolve(event.rtcStatsReports);
        // });
        // this._nativePC.rtcStatsEnabled = true;
      });
    }
  }
  for (const type of [
    "negotiationneeded",
    "icecandidate",
    "signalingstatechange",
    "iceconnectionstatechange",
    "icegatheringstatechange",
    "datachannel",
    "addstream",
    "removestream"
  ]) {
    const prop = "on" + type;
    Object.defineProperty(RTCPeerConnection.prototype, prop, {
      configurable: true,
      enumerable: true,
      get() {
        return this._nativePC[prop];
      },
      set(value) {
        if (value)
          this._nativePC[prop] = event => value.call(this, event);
        else
          this._nativePC[prop] = null;
      }
    });
  }
  self.RTCPeerConnection = RTCPeerConnection;

  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    if (object instanceof MediaStream)
      return "webrtc:";
    return origCreateObjectURL.apply(this, arguments);
  };
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url) {
    if (url === "webrtc:")
      return;
    return origRevokeObjectURL.apply(this, arguments);
  };
  HTMLMediaElement.prototype.setSinkId = function (sinkId) {
    return Promise.resolve(media.setAudioOutputDevice(sinkId));
  };
  AudioContext.prototype.createMediaStreamSource = function (mediaStream) {
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
      if (value instanceof Org.WebRtc.MediaStream) {
        attachMediaStream(this, value);
        return;
      } else if (this.msRealTime) {
        this.removeAttribute("src");
        this.msRealTime = false;
      }
      if (value === undefined)
        value = null;
      origSrcObject.call(this, value);
    }
  });
})(Promise);
