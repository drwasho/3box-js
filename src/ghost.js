const EventEmitter = require('events')
const idUtils = require('./utils/id')
const Room = require('ipfs-pubsub-room')

class GhostChat extends EventEmitter {

  // TODO:
  // - constructor x
  // - join logic x
  // - leave logic x
  // - message sending logic x
  // - jwt signing/decoding logic x
  // - listener logic x
  // - backlog logic 
  // - filter logic

  /**
   * Please use **space.joinChat** to get the instance of this class
   */
  constructor (name, replicator, threeId) {
    this._name = name
    this._spaceName = name.split('.')[2]
    this._3id = threeId
    this._room = Room(replicator.ipfs, name) // TODO: find ipfs

    this._backlog = new Set() // set of past messages

    this.broadcast({ this._3id.signJWT() }) // Announce entry in chat and share our 3id and peerID
    // signing an empty jwt should suffice for this
    this._room.on('message', this._funnelMessage) // funnels message to either onJoin, onLeave or onMessage
    this._room.on('peer left', this._userLeft)
  }

  /**
   * Get name of the chat
   *
   * @return    {String}      chat name
   */
  get name () {
    return this._name
  }

  /**
   * Get all users online
   *
   * @return    {Array<Object>}      users online
   */
  get onlineUsers () {
    return Object.entries(this._usersOnline)
  }

  /**
   * Post a message to the thread
   *
   * @param     {Object}    message                 The message
   * @param     {String}    to                      PeerID to send the message to
   * @return    {String}                            The postId of the new post
   */
  post (message, to = null) {
    !to ? this.broadcast({ type: 'chat', ...message })
    : this.sendDirect(to, { type: 'chat', ...message })
  }


  /**
   * Leave the chat
   *
   */
  async leaveChat () {
    await this._room.leave()
  }

  /**
   * Broadcast a message to peers in the room
   *
   * @param     {Object}    message                 The message
   */
  broadcast (message) {
    const jwt = this._3id.signJWT(message)
    this._room.broadcast(jwt)
  }

  /**
   * Send a direct message to a peer
   *
   * @param     {String}    peerID              The PeerID of the receiver
   * @param     {Object}    message             The message
   */
  sendDirect (peerID, message) {
    const jwt = this._3id.signJWT(message)
    this._room.sendTo(peerID, jwt)
  }

  /**
   * Funnel message to appropriate handler
   *
   * @param     {Object}    message              The message
   */
  _funnelMessage ({ from, data }) {
    // reads payload type and determines whether it's a join, leave or chat message
    const jwt = data.toString()
    const { payload, issuer, signer } = await idUtils.verifyJWT(jwt)
    if (issuer != signer.id) throw new Error('jwt is invalid')
    if (payload.iss != signer.id) throw new Error('jwt is invalid') // TODO: which one is it?

    if (!this.onlineUsers.hasOwnProperty(from)) this._userJoined(from, issuer)
    this._messageReceived(payload)

    // switch (payload.type) {
    //   case 'join':
    //     this._userJoined(issuer, from)
    //   break
    //   case 'request_backlog':
    //     let response = this._3id.signJWT({ type: 'response', backlog: this.backlog })
    //     this.sendDirect(from, { type: 'response', backlog: this.backlog }) // TODO: does it look good?
    //   break
    //   case 'reponse':
    //     this._backlog.add(payload.backlog) // TODO: does it look good?
    //   break
    //   case 'chat':
    //     this._messageReceived(payload)
    //   break
    // }

  }

  _userJoined(peerID, did) {
    this._usersOnline[peerID] = did
    this.emit('user-joined', { did, peerID })
  }

  _userLeft(peerID) {
    const did = this._usersOnline[peerID]
    delete this._usersOnline[peerID]
    this.emit('user-left', { did, peerID })
  }

  _messageReceived(message) {
    this._backlog.push(message)
    this.emit('message', message)
  }

  /**
   * Register a function to be called after a user joins the chat
   *
   * @param     {Function}    callback              on-join callback
   */
  onJoin (callback) {
    this.on('user-joined', callback)
  }

  /**
   * Register a function to be called after a user leaves the chat
   *
   * @param     {Function}    callback              on-left callback
   */
  onLeave (callback) {
    this.on('user-left', callback)
  }

  /**
   * Register a function to be called after a user posts a message to the chat
   *
   * @param     {Function}    callback              on-message callback
   */
  onMessage (callback) {
    this.on('message', callback)
  }

}

module.exports = GhostChat
