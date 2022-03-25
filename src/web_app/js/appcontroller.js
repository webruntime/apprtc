/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */

/* globals trace, InfoBox, setUpFullScreen, isFullScreen, RoomSelection, $ */
/* exported AppController, remoteVideo */

'use strict';

// TODO(jiayl): remove |remoteVideo| once the chrome browser tests are updated.
// Do not use in the production code.
var remoteVideo = $('#remote-video');

// Keep this in sync with the HTML element id attributes. Keep it sorted.
var UI_CONSTANTS = {
  confirmJoinButton: '#confirm-join-button',
  confirmJoinDiv: '#confirm-join-div',
  confirmJoinRoomSpan: '#confirm-join-room-span',
  fullscreenSvg: '#fullscreen',
  hangupSvg: '#hangup',
  icons: '#icons',
  infoDiv: '#info-div',
  localCamera: '#local-camera',
  localVideo: '#local-video',
  muteAudioSvg: '#mute-audio',
  muteVideoSvg: '#mute-video',
  newRoomButton: '#new-room-button',
  newRoomLink: '#new-room-link',
  privacyLinks: '#privacy',
  remoteCamera: '#remote-camera',
  remoteVideo: '#remote-video',
  rejoinButton: '#rejoin-button',
  rejoinDiv: '#rejoin-div',
  rejoinLink: '#rejoin-link',
  roomLinkHref: '#room-link-href',
  roomSelectionDiv: '#room-selection',
  roomSelectionJoinButton: '#join-button',
  sharingDiv: '#sharing-div',
  statusDiv: '#status-div',
  turnInfoDiv: '#turn-info-div',
  videosDiv: '#videos',
  roomIdInput: '#room-id-input',
};

// The controller that connects the Call with the UI.
var AppController = function(loadingParams) {
  trace('Initializing; server= ' + loadingParams.roomServer + '.');
  trace('Initializing; room=' + loadingParams.roomId + '.');

  this.hangupSvg_ = $(UI_CONSTANTS.hangupSvg);
  this.icons_ = $(UI_CONSTANTS.icons);
  this.localVideo_ = $(UI_CONSTANTS.localVideo);
  this.sharingDiv_ = $(UI_CONSTANTS.sharingDiv);
  this.statusDiv_ = $(UI_CONSTANTS.statusDiv);
  this.turnInfoDiv_ = $(UI_CONSTANTS.turnInfoDiv);
  this.remoteCamera_ = $(UI_CONSTANTS.remoteCamera);
  this.remoteVideo_ = $(UI_CONSTANTS.remoteVideo);
  this.videosDiv_ = $(UI_CONSTANTS.videosDiv);
  this.roomLinkHref_ = $(UI_CONSTANTS.roomLinkHref);
  this.rejoinDiv_ = $(UI_CONSTANTS.rejoinDiv);
  this.rejoinLink_ = $(UI_CONSTANTS.rejoinLink);
  this.newRoomLink_ = $(UI_CONSTANTS.newRoomLink);
  this.rejoinButton_ = $(UI_CONSTANTS.rejoinButton);
  this.newRoomButton_ = $(UI_CONSTANTS.newRoomButton);
  this.roomIdInput_ = $(UI_CONSTANTS.roomIdInput);
  this.roomSelectionDiv_ = $(UI_CONSTANTS.roomSelectionDiv);
  this.roomJoinButton_ = this.roomSelectionDiv_.querySelector(
      UI_CONSTANTS.roomSelectionJoinButton);

  this.muteAudioIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.muteAudioSvg);
  this.muteVideoIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.muteVideoSvg);
  this.fullscreenIconSet_ =
      new AppController.IconSet_(UI_CONSTANTS.fullscreenSvg);

  this.loadingParams_ = loadingParams;
  this.loadUrlParams_();

  var paramsPromise = Promise.resolve({});

  Promise.resolve(paramsPromise).then(function(newParams) {
    // Merge newly retrieved params with loadingParams.
    if (newParams) {
      Object.keys(newParams).forEach(function(key) {
        this.loadingParams_[key] = newParams[key];
      }.bind(this));
    }

    this.newRoomButton_.addEventListener('click',
        this.onNewRoomClick_.bind(this), false);
    this.rejoinButton_.addEventListener('click',
        this.onRejoinClick_.bind(this), false);

    this.roomLink_ = '';

    this.localCameraStream_ = null;

    this.localVideoUrl_ = null;
    this.localVideoStream_ = null;

    this.selectedRoomId_ = null;
    this.remoteCameraStreamId_ = null;
    this.remoteVideoStreamId_ = null;

    // If the params has a roomId specified, we should connect to that room
    // immediately. If not, show the room selection UI.
    if (this.loadingParams_.roomId) {
      this.createCall_();

      // Ask the user to confirm.
      if (!RoomSelection.matchRandomRoomPattern(this.loadingParams_.roomId)) {
        // Show the room name only if it does not match the random room pattern.
        $(UI_CONSTANTS.confirmJoinRoomSpan).textContent = ' "' +
            this.loadingParams_.roomId + '"';
      }
      var confirmJoinDiv = $(UI_CONSTANTS.confirmJoinDiv);
      this.show_(confirmJoinDiv);

      $(UI_CONSTANTS.confirmJoinButton).onclick = function() {
        this.hide_(confirmJoinDiv);

        // Record this room in the recently used list.
        var recentlyUsedList = new RoomSelection.RecentlyUsedList();
        recentlyUsedList.pushRecentRoom(this.loadingParams_.roomId);
        this.finishCallSetup_(this.loadingParams_.roomId);
      }.bind(this);

      if (this.loadingParams_.bypassJoinConfirmation) {
        $(UI_CONSTANTS.confirmJoinButton).onclick();
      }
    } else {
      // Display the room selection UI.
      this.showRoomSelection_();
    }
  }.bind(this)).catch(function(error) {
    trace('Error initializing: ' + error.message);
  }.bind(this));
};

AppController.prototype.createCall_ = function() {
  var privacyLinks = $(UI_CONSTANTS.privacyLinks);
  this.hide_(privacyLinks);
  this.call_ = new Call(this.loadingParams_);
  this.infoBox_ = new InfoBox($(UI_CONSTANTS.infoDiv), this.call_,
      this.loadingParams_.versionInfo);

  var roomErrors = this.loadingParams_.errorMessages;
  var roomWarnings = this.loadingParams_.warningMessages;
  if (roomErrors && roomErrors.length > 0) {
    for (var i = 0; i < roomErrors.length; ++i) {
      this.infoBox_.pushErrorMessage(roomErrors[i]);
    }
    return;
  } else if (roomWarnings && roomWarnings.length > 0) {
    for (var j = 0; j < roomWarnings.length; ++j) {
      this.infoBox_.pushWarningMessage(roomWarnings[j]);
    }
  }

  // TODO(jiayl): replace callbacks with events.
  this.call_.onremotehangup = this.onRemoteHangup_.bind(this);
  this.call_.onremotesdpset = this.onRemoteSdpSet_.bind(this);
  this.call_.onremotestreamadded = this.onRemoteStreamAdded_.bind(this);
  this.call_.onlocalstreamadded = this.onLocalStreamAdded_.bind(this);

  this.call_.onsignalingstatechange =
      this.infoBox_.updateInfoDiv.bind(this.infoBox_);
  this.call_.oniceconnectionstatechange =
      this.infoBox_.updateInfoDiv.bind(this.infoBox_);
  this.call_.onnewicecandidate =
      this.infoBox_.recordIceCandidateTypes.bind(this.infoBox_);

  this.call_.onerror = this.displayError_.bind(this);
  this.call_.onturnstatusmessage = this.displayTurnStatus_.bind(this);
  this.call_.oncallerstarted = this.displaySharingInfo_.bind(this);

  this.call_.getlocalvideostream = this.onGetLocalVideoStream_.bind(this);

  this.call_.requestMediaAndIceServers_();
};

AppController.prototype.setLocalVideoFile_ = function(videoUrl) {
  trace('Setting local video file to share: ' + videoUrl);

  this.localVideoUrl_ = videoUrl;
  this.localVideo_.src = this.localVideoUrl_;
  this.localVideo_.pause();

  let hypenPos = videoUrl.lastIndexOf("-");
  let urlLength = videoUrl.length;
  this.selectedRoomId_ = videoUrl.substr(hypenPos + 1, urlLength - hypenPos);
  trace('Selected roomName= ' + this.selectedRoomId_);

  this.displayStatus_('');
};

AppController.prototype.showRoomSelection_ = function() {
  if (this.localVideoUrl_) {
    this.roomIdInput_.value = "";
    this.localVideoUrl_ = null;
  }

  this.show_(this.roomSelectionDiv_);

  this.roomJoinButton_.addEventListener(
      'click', this.onRoomSelected_.bind(this), false);
};

AppController.prototype.onRoomSelected_ = function() {
  if (!this.selectedRoomId_) {
    alert("You must select a video file to Create a Video Room.");
    return;
  }

  this.hide_(this.roomSelectionDiv_);
  this.createCall_();
  this.finishCallSetup_(this.selectedRoomId_);

  if (this.localCameraStream_) {
    this.attachLocalStream_();
  }
};

AppController.prototype.setupUi_ = function() {
  this.iconEventSetup_();
  document.onkeypress = this.onKeyPress_.bind(this);
  window.onmousemove = this.showIcons_.bind(this);

  $(UI_CONSTANTS.muteAudioSvg).onclick = this.toggleAudioMute_.bind(this);
  $(UI_CONSTANTS.muteVideoSvg).onclick = this.toggleVideoMute_.bind(this);
  $(UI_CONSTANTS.fullscreenSvg).onclick = this.toggleFullScreen_.bind(this);
  $(UI_CONSTANTS.hangupSvg).onclick = this.hangup_.bind(this);

  setUpFullScreen();
};

AppController.prototype.finishCallSetup_ = function(roomId) {
  this.call_.start(roomId);
  this.setupUi_();

  // Call hangup with async = false. Required to complete multiple
  // clean up steps before page is closed.
  window.onbeforeunload = function() {
    this.call_.hangup(false);
  }.bind(this);

  window.onpopstate = function(event) {
    if (!event.state) {
      // TODO (chuckhays) : Resetting back to room selection page not
      // yet supported, reload the initial page instead.
      trace('Reloading main page.');
      location.href = location.origin;
    } else {
      // This could be a forward request to open a room again.
      if (event.state.roomLink) {
        location.href = event.state.roomLink;
      }
    }
  };
};

AppController.prototype.hangup_ = function() {
  trace('Hanging up.');
  this.hide_(this.icons_);
  this.displayStatus_('Hanging up');
  this.transitionToDone_();

  // Call hangup with async = true.
  this.call_.hangup(true);
  // Reset key and mouse event handlers.
  document.onkeypress = null;
  window.onmousemove = null;
};

AppController.prototype.onRemoteHangup_ = function() {
  this.displayStatus_('The remote side hung up.');
  this.transitionToWaiting_();

  this.call_.onRemoteHangup();
};

AppController.prototype.onRemoteSdpSet_ = function(hasRemoteVideo) {
  if (hasRemoteVideo) {
    trace('Waiting for remote data.');
    this.waitForRemoteVideo_();
  } else {
    trace('No remote video stream; not waiting for media to arrive.');
    // TODO(juberti): Make this wait for ICE connection before transitioning.
    this.transitionToActive_();
  }
};

AppController.prototype.waitForRemoteVideo_ = function() {
  // Wait for the actual video to start arriving before moving to the active
  // call state.
  if (this.remoteCamera_.readyState >= 2) {
    trace('Remote camera started; currentTime: ' + this.remoteCamera_.currentTime);
    if (this.localVideoUrl_) {
      this.transitionToActive_();
      return;
    } else {
      if (this.remoteVideo_.readyState >= 2) {
        trace('Remote video started; currentTime: ' + this.remoteVideo_.currentTime);
        this.transitionToActive_();
        return;
      } else {
        trace('Waiting for remote video.');
        this.remoteVideo_.oncanplay = this.waitForRemoteVideo_.bind(this);
      }
    }
  } else {
    trace('Waiting for remote camera.');
    this.remoteCamera_.oncanplay = this.waitForRemoteVideo_.bind(this);
  }
};

AppController.prototype.onRemoteStreamAdded_ = function(stream) {
  trace('Remote Stream Id= ' + stream.id);

  this.deactivate_(this.sharingDiv_);
  this.displayTurnStatus_('');

  if (!this.remoteCamera_.srcObject) {
    this.remoteCamera_.srcObject = stream;
    this.remoteCameraStreamId_ = stream.id;
    trace('Remote Camera Stream Id= ' + this.remoteCameraStreamId_);
  }

  if (this.remoteCameraStreamId_ == stream.id) {
    return;
  }

  if (!this.remoteVideo_.srcObject) {
    this.remoteVideo_.srcObject = stream;
    this.remoteVideoStreamId_ = stream.id;
    trace('Remote Video Stream Id= ' + this.remoteVideoStreamId_);
  }
};

AppController.prototype.onGetLocalVideoStream_ = function() {
  if (this.localVideoUrl_) {
    this.activate_(this.localVideo_);
    this.localVideoStream_ = this.localVideo_.captureStream();
  } else {
    this.localVideoStream_ = this.localVideo_.captureStream();
    this.deactivate_(this.localVideo_);
  }

  return this.localVideoStream_;
};

AppController.prototype.onLocalStreamAdded_ = function(stream) {
  this.localCameraStream_ = stream;

  this.infoBox_.getLocalTrackIds(this.localCameraStream_);
  this.attachLocalStream_();
};

AppController.prototype.attachLocalStream_ = function() {
  trace('Attaching local camera stream to share.');

  this.displayStatus_('');

  this.show_(this.icons_);
  if (this.localCameraStream_.getVideoTracks().length === 0) {
    this.hide_($(UI_CONSTANTS.muteVideoSvg));
  }
  if (this.localCameraStream_.getAudioTracks().length === 0) {
    this.hide_($(UI_CONSTANTS.muteAudioSvg));
  }
};

AppController.prototype.transitionToActive_ = function() {
  trace('Transition to Active state.');

  // Stop waiting for remote video.
  this.remoteCamera_.oncanplay = undefined;
  this.remoteVideo_.oncanplay = undefined;

  var connectTime = window.performance.now();
  this.infoBox_.setSetupTimes(this.call_.startTime, connectTime);
  this.infoBox_.updateInfoDiv();
  trace('Call setup time: ' + (connectTime - this.call_.startTime).toFixed(0) +
      'ms.');

  if (this.localVideoUrl_) {
    if (this.localVideo_.paused)
      this.localVideo_.play();
    this.deactivate_(this.remoteVideo_);
  } else {
    // Show the remote video.
    this.activate_(this.remoteVideo_);
  }

  // Transition opacity from 0 to 1 for the remote and mini videos.
  this.activate_(this.remoteCamera_);

  // Rotate the div containing the videos 180 deg with a CSS transform.
  this.activate_(this.videosDiv_);
  this.show_(this.hangupSvg_);

  this.displayStatus_('');
};

AppController.prototype.transitionToWaiting_ = function() {
  trace('Transition to Waiting state.');

  // Stop waiting for remote video.
  this.remoteCamera_.oncanplay = undefined;
  this.remoteVideo_.oncanplay = undefined;

  this.hide_(this.hangupSvg_);

  // Rotate the div containing the videos -180 deg with a CSS transform.
  this.deactivate_(this.videosDiv_);

  this.remoteCamera_.srcObject = null;
  this.deactivate_(this.remoteCamera_);

  if (this.localVideoUrl_) {
    if (!this.localVideo_.paused)
      this.localVideo_.pause();
    this.activate_(this.localVideo_);
  } else {
    this.deactivate_(this.localVideo_);
  }

  this.remoteVideo_.srcObject = null;
  this.deactivate_(this.remoteVideo_);
};

AppController.prototype.transitionToDone_ = function() {
  trace('Transition to Done state.');

  // Stop waiting for remote video.
  this.remoteVideo_.oncanplay = undefined;
  this.remoteCamera_.oncanplay = undefined;

  this.remoteVideo_.srcObject = null;
  this.remoteCamera_.srcObject = null;

  if (this.localVideoUrl_) {
    if (!this.localVideo_.paused)
      this.localVideo_.pause();
  }

  this.localVideoStream_ = null;
  this.localCameraStream_ = null;

  this.deactivate_(this.remoteVideo_);
  this.deactivate_(this.remoteCamera_);
  this.deactivate_(this.localVideo_);

  this.hide_(this.hangupSvg_);

  this.activate_(this.rejoinDiv_);
  this.show_(this.rejoinDiv_);
  this.displayStatus_('');
  this.displayTurnStatus_('');
};

AppController.prototype.onRejoinClick_ = function() {
  this.deactivate_(this.rejoinDiv_);
  this.hide_(this.rejoinDiv_);
  this.call_.restart();
  this.setupUi_();
};

AppController.prototype.onNewRoomClick_ = function() {
  this.deactivate_(this.rejoinDiv_);
  this.hide_(this.rejoinDiv_);
  this.showRoomSelection_();
};

// Spacebar, or m: toggle audio mute.
// c: toggle camera(video) mute.
// f: toggle fullscreen.
// i: toggle info panel.
// q: quit (hangup)
// Return false to screen out original Chrome shortcuts.
AppController.prototype.onKeyPress_ = function(event) {
  switch (String.fromCharCode(event.charCode)) {
    case ' ':
    case 'm':
      if (this.call_) {
        this.call_.toggleAudioMute();
        this.muteAudioIconSet_.toggle();
      }
      return false;
    case 'c':
      if (this.call_) {
        this.call_.toggleVideoMute();
        this.muteVideoIconSet_.toggle();
      }
      return false;
    case 'f':
      this.toggleFullScreen_();
      return false;
    case 'i':
      this.infoBox_.toggleInfoDiv();
      return false;
    case 'q':
      this.hangup_();
      return false;
    case 'l':
      this.toggleMiniVideo_();
      return false;
    default:
      return;
  }
};

AppController.prototype.pushCallNavigation_ = function(roomId, roomLink) {
  window.history.pushState({'roomId': roomId, 'roomLink': roomLink}, roomId,
      roomLink);
};

AppController.prototype.displaySharingInfo_ = function(roomId, roomLink) {
  this.roomLinkHref_.href = roomLink;
  this.roomLinkHref_.text = roomLink;
  this.roomLink_ = roomLink;
  this.pushCallNavigation_(roomId, roomLink);
  this.activate_(this.sharingDiv_);
};

AppController.prototype.displayStatus_ = function(status) {
  if (status === '') {
    this.deactivate_(this.statusDiv_);
  } else {
    this.activate_(this.statusDiv_);
  }
  this.statusDiv_.innerHTML = status;
};

AppController.prototype.displayTurnStatus_ = function(status) {
  if (status === '') {
    this.deactivate_(this.turnInfoDiv_);
  } else {
    this.activate_(this.turnInfoDiv_);
  }
  this.turnInfoDiv_.innerHTML = status;
};

AppController.prototype.displayError_ = function(error) {
  trace(error);
  this.infoBox_.pushErrorMessage(error);
};

AppController.prototype.toggleAudioMute_ = function() {
  this.call_.toggleAudioMute();
  this.muteAudioIconSet_.toggle();
};

AppController.prototype.toggleVideoMute_ = function() {
  this.call_.toggleVideoMute();
  this.muteVideoIconSet_.toggle();
};

AppController.prototype.toggleFullScreen_ = function() {
  if (isFullScreen()) {
    trace('Exiting fullscreen.');
    document.querySelector('svg#fullscreen title').textContent =
        'Enter fullscreen';
    document.cancelFullScreen();
  } else {
    trace('Entering fullscreen.');
    document.querySelector('svg#fullscreen title').textContent =
        'Exit fullscreen';
    document.body.requestFullScreen();
  }
  this.fullscreenIconSet_.toggle();
};

AppController.prototype.toggleMiniVideo_ = function() {
  if (this.remoteCamera_.classList.contains('active')) {
    this.deactivate_(this.remoteCamera_);
  } else {
    this.activate_(this.remoteCamera_);
  }
};

AppController.prototype.hide_ = function(element) {
  element.classList.add('hidden');
};

AppController.prototype.show_ = function(element) {
  element.classList.remove('hidden');
};

AppController.prototype.activate_ = function(element) {
  element.classList.add('active');
};

AppController.prototype.deactivate_ = function(element) {
  element.classList.remove('active');
};

AppController.prototype.showIcons_ = function() {
  if (!this.icons_.classList.contains('active')) {
    this.activate_(this.icons_);
    this.setIconTimeout_();
  }
};

AppController.prototype.hideIcons_ = function() {
  if (this.icons_.classList.contains('active')) {
    this.deactivate_(this.icons_);
  }
};

AppController.prototype.setIconTimeout_ = function() {
  if (this.hideIconsAfterTimeout) {
    window.clearTimeout.bind(this, this.hideIconsAfterTimeout);
  }
  this.hideIconsAfterTimeout = window.setTimeout(function() {
    this.hideIcons_();
  }.bind(this), 5000);
};

AppController.prototype.iconEventSetup_ = function() {
  this.icons_.onmouseenter = function() {
    window.clearTimeout(this.hideIconsAfterTimeout);
  }.bind(this);

  this.icons_.onmouseleave = function() {
    this.setIconTimeout_();
  }.bind(this);
};

AppController.prototype.loadUrlParams_ = function() {
  /* eslint-disable dot-notation */
  // Suppressing eslint warns about using urlParams['KEY'] instead of
  // urlParams.KEY, since we'd like to use string literals to avoid the Closure
  // compiler renaming the properties.
  var DEFAULT_VIDEO_CODEC = 'VP9';
  var urlParams = queryStringToDictionary(window.location.search);
  this.loadingParams_.audioSendBitrate = urlParams['asbr'];
  this.loadingParams_.audioSendCodec = urlParams['asc'];
  this.loadingParams_.audioRecvBitrate = urlParams['arbr'];
  this.loadingParams_.audioRecvCodec = urlParams['arc'];
  this.loadingParams_.opusMaxPbr = urlParams['opusmaxpbr'];
  this.loadingParams_.opusFec = urlParams['opusfec'];
  this.loadingParams_.opusDtx = urlParams['opusdtx'];
  this.loadingParams_.opusStereo = urlParams['stereo'];
  this.loadingParams_.videoSendBitrate = urlParams['vsbr'];
  this.loadingParams_.videoSendInitialBitrate = urlParams['vsibr'];
  this.loadingParams_.videoSendCodec = urlParams['vsc'];
  this.loadingParams_.videoRecvBitrate = urlParams['vrbr'];
  this.loadingParams_.videoRecvCodec = urlParams['vrc'] || DEFAULT_VIDEO_CODEC;
  this.loadingParams_.videoFec = urlParams['videofec'];
  /* eslint-enable dot-notation */
};

AppController.IconSet_ = function(iconSelector) {
  this.iconElement = document.querySelector(iconSelector);
};

AppController.IconSet_.prototype.toggle = function() {
  if (this.iconElement.classList.contains('on')) {
    this.iconElement.classList.remove('on');
    // turn it off: CSS hides `svg path.on` and displays `svg path.off`
  } else {
    // turn it on: CSS displays `svg.on path.on` and hides `svg.on path.off`
    this.iconElement.classList.add('on');
  }
};