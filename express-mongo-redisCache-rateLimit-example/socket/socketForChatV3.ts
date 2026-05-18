//@ts-ignore
import { Server as SocketIOServer, Socket } from 'socket.io';
//@ts-ignore
import { createAdapter } from '@socket.io/redis-adapter';
//@ts-ignore
import { Server } from 'http';
import { RedisStateManager } from '../redis/redisStateManagerForSocketV2';
import { logger } from '../../shared/logger';
//@ts-ignore
import colors from 'colors';
import getUserDetailsFromToken from '../getUesrDetailsFromToken';
import { User } from '../../modules/user.module/user/user.model';
import { TRole } from '../../middlewares/roles';
import { IUser } from '../../modules/user.module/user/user.interface';
import { INotification } from '../../modules/notification/notification.interface';
import { ConversationParticipentsService } from '../../modules/chatting.module/conversationParticipents/conversationParticipents.service';
import { MessagerService } from '../../modules/chatting.module/message/message.service';
import { Conversation } from '../../modules/chatting.module/conversation/conversation.model';
import { ConversationParticipents } from '../../modules/chatting.module/conversationParticipents/conversationParticipents.model';
import { Message } from '../../modules/chatting.module/message/message.model';
import { IUserDevices } from '../../modules/user.module/userDevices/userDevices.interface';
import { UserDevices } from '../../modules/user.module/userDevices/userDevices.model';
import { sendPushNotificationV2 } from '../../utils/firebaseUtils';
import { config } from '../../config';
//@ts-ignore
import { Types } from 'mongoose';

export type IUserProfile = Pick<IUser, '_id' | 'name' | 'profileImage' | 'role' | 'subscriptionType' | 'fcmToken'>;

interface MessageData {
  conversationId: string;
  senderId: string;
  text: string;
  // Add other message properties as needed
}

export interface IMessageToEmmit extends MessageData {
  _id: Types.ObjectId,
  senderId: Types.ObjectId,
  name: string,
  image: string,
  createdAt: Date
}

async function getConversationById(conversationId: string) {
  try {
    const conversationData = await Conversation.findById(conversationId)//.populate('users').exec();  // FIXME: user populate korar bishoy ta 
    // FIXME : check korte hobe  

    const conversationParticipants = await ConversationParticipents.find({
      conversationId: conversationId
    });

    if (!conversationData) {
      throw new Error(`Conversation with ID ${conversationId} not found`);
    }
    return {
      conversationData: conversationData,
      conversationParticipants: conversationParticipants
    };
  } catch (error) {
    console.error('Error fetching chat:', error);
    throw error;
  }
}

// 🔎🔎🔎 Helper function to emit errors
function emitError(socket: any, message: string, disconnect: boolean = false) {
  socket.emit('io-error', {
    success: false,
    message,
    timestamp: new Date().toISOString()
  });
  if (disconnect) {
    socket.disconnect();
  }
}


export class SocketService {

  private static instance: SocketService;
  private io: SocketIOServer | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private redisStateManager!: RedisStateManager;

  private constructor() { }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  // 🥇
  public async initialize(
    socketPort: number,
    server: http.Server,
    redisPubClient: any,
    redisSubClient: any,
    redisStateClient: any
  ): Promise<SocketIOServer> {

    // Prevent multiple initializations
    if (this.isInitialized) {
      logger.warn(`⚠️ Socket.IO already initialized in worker ${process.pid}`);
      return this.io!;
    }

    if (this.isInitializing) {
      logger.warn(`⚠️ Socket.IO initialization in progress in worker ${process.pid}`);
      throw new Error('Socket.IO initialization already in progress');
    }

    this.isInitializing = true;

    try {
      logger.info(colors.blue(`🔧 Initializing Socket.IO in worker ${process.pid}...`));

      // Create Socket.IO server
      this.io = new SocketIOServer(server, {
        cors: {
          origin: '*',
          credentials: true, // 👈 critical!
        },
      });

      server.listen(socketPort, config.backend.ip as string, () => {
        logger.info(colors.green(`🔌 Socket.IO listening on http://${config.backend.ip}:${socketPort}`));
      });

      // Initialize Redis state manager
      this.redisStateManager = new RedisStateManager(redisStateClient);

      // Setup Redis adapter with error handling
      try {
        const adapter = createAdapter(redisPubClient, redisSubClient);
        this.io.adapter(adapter);
        logger.info(colors.green(`✅ Redis adapter attached to worker ${process.pid}`));
      } catch (adapterError) {
        logger.error('Failed to setup Redis adapter:', adapterError);
        throw adapterError;
      }

      // Setup middleware and event handlers
      await this.setupMiddleware();
      this.setupEventHandlers();

      // Add connection error handlers
      this.setupErrorHandlers();

      this.isInitialized = true;
      this.isInitializing = false;

      logger.info(colors.green(`🚀 Socket.IO successfully initialized in worker ${process.pid}`));

      return this.io;

    } catch (error) {
      this.isInitializing = false;
      logger.error(`💥 Failed to initialize Socket.IO in worker ${process.pid}:`, error);
      throw error;
    }
  }

  public getIO(): SocketIOServer {
    if (!this.isInitialized || !this.io) {
      throw new Error(`Socket.IO not initialized in worker ${process.pid}`);
    }
    return this.io;
  }

  // 🔗➡️ initialize function
  private async setupMiddleware() {
    if (!this.io) return;

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token ||
          socket.handshake.headers.token as string;



        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const user = await this.getUserDetailsFromToken(token);

        // console.log("user", user)
        // 🔥 CRITICAL: Convert ObjectId to string

        if (!user) {
          return next(new Error('Invalid authentication token'));
        }

        const modifiedUser = {
          ...user,  // 🟡 issue  MUST BE RESOLVED
          _id: user._id.toString(), // 🔥 CRITICAL: Convert ObjectId to string
        };
        //💡 Rule: Always convert Mongoose ObjectId to .toString() before using in Redis, Socket.IO rooms, or logs. 
        socket.data.user = modifiedUser; // 🟡 issue  MUST BE RESOLVED
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  // 🔗➡️ initialize function
  private setupEventHandlers() {
    if (!this.io) return;

    //---------------------------------
    // 🟢🟢 
    //---------------------------------
    this.io.on('connection', async (socket: Socket) => {
      const user = socket.data.user; // 🟡 issue  MUST BE RESOLVED


      const userId = user._id;
      const workerId = process.pid.toString();

      logger.info(colors.blue(
        `🔌🟢 User connected: ${userId} on Worker ${workerId} Socket ${socket.id}`
      ));

      try {
        // Get user profile
        const userProfile = await this.getUserProfile(userId) as IUserProfile;

        console.log("userProfile in connection 🔌🔌", userProfile)
        socket.data.userProfile = userProfile;

        // Handle connection in Redis
        const oldSocketId = await this.redisStateManager.handleUserReconnection(
          userId,
          socket.id,
          workerId,
          // { name: user.name, profileImage: userProfile?.profileImage }
          userProfile
        );

        // Disconnect old socket if exists
        if (oldSocketId) {
          const oldSocket = this.io!.sockets.sockets.get(oldSocketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        }

        // Join user to their personal room
        socket.join(userId);

        // 🆕 Join role-based rooms
        if (userProfile.role == TRole.admin) {
          console.log("🔌3🔌")
          socket.join(`role::${userProfile.role}`); // e.g., "role::admin", "role::user"
          logger.info(`👤🛡️ User ${userId} joined role room: role::${userProfile.role}`);
        }

        // 🆕 Auto-join family room (based on childrenBusinessUser relationship)
        // Figma: dashboard-flow-01.png (Live Activity section)
        // Every user (parent or child) automatically joins their family room
        await this.autoJoinFamilyRoom(socket, userId, userProfile);

        // Notify related users about online status
        await this.notifyRelatedUsersOnlineStatus(userId, userProfile, true);

        // Setup event handlers
        this.setupUserEventHandlers(socket, userId, userProfile);

        // Handle disconnection
        socket.on('disconnect', async () => {
          await this.handleUserDisconnection(socket, userId);
        });

      } catch (error) {
        logger.error('Error in socket connection:', error);
        socket.disconnect();
      }
    });
  }

  // 🔗➡️ initialize function
  private setupErrorHandlers() {
    if (!this.io) return;

    this.io.engine.on('connection_error', (err) => {
      logger.error(`🔴 Socket.IO connection error in worker ${process.pid}:`, {
        message: err.message,
        description: err.description,
        context: err.context,
        type: err.type
      });
    });

    this.io.on('error', (error) => {
      logger.error(`🔴 Socket.IO server error in worker ${process.pid}:`, error);
    });

    // Handle adapter errors ❌ REMOVE THIS — IT'S INVALID
    // this.io.adapter.on('error', (error) => {
    //   logger.error(`🔴 Redis adapter error in worker ${process.pid}:`, error);
    // });
  }

  // 🔗➡️ setupEventHandlers
  private setupUserEventHandlers(socket: Socket, userId: string, userProfile: IUserProfile) {
    //---------------------------------
    //   Handle Returning all related online users not all online users ..   🟢working perfectly
    //--------------------------------- 
    // Get related online users
    socket.on('only-related-online-users', async (data: { userId: string }, callback) => {
      try {
        const relatedOnlineUsers = await this.redisStateManager.getRelatedOnlineUsers(data.userId);

        logger.info(`📊 Related online users for ${data.userId}: ${relatedOnlineUsers.length}`);
        callback?.({ success: true, data: relatedOnlineUsers });
      } catch (error) {
        logger.error('Error getting related online users:', error);
        callback?.({ success: false, message: 'Failed to fetch related online users' });
      }
    });

    //---------------------------------
    //  Handle joining chat rooms  🟢working perfectly
    //--------------------------------- 
    // Join conversation
    socket.on('join', async (conversationData: { conversationId: string }, callback) => {
      if (!conversationData.conversationId) {
        return this.emitError(socket, 'conversationId is required');
      }

      const conversationId = conversationData.conversationId;

      console.log(`User ${userProfile.name} joining chat ${conversationData.conversationId}`);

      // Join socket.io room
      socket.join(conversationId);

      // Update Redis state
      await this.redisStateManager.joinRoom(userId, conversationId);

      // Get room users from Redis
      const roomUsers = await this.redisStateManager.getRoomUsers(conversationId);

      logger.info(`👥 Room ${conversationId} has ${roomUsers.length} users: ${roomUsers.join(', ')}`);

      // Notify others in the chat
      socket.to(conversationId).emit('user-joined-chat', {
        userId,
        userName: userProfile?.name,
        conversationId,
        isOnline: true
      });
    });

    //---------------------------------
    // Handle leaving conversation 🟢working perfectly 
    //---------------------------------
    // Leave conversation
    socket.on('leave', async (conversationData: { conversationId: string }, callback) => {
      if (!conversationData.conversationId) {
        return callback?.({ success: false, message: 'conversationId is required' });
      }

      const conversationId = conversationData.conversationId;

      // Leave socket.io room
      socket.leave(conversationId);

      // Update Redis state
      await this.redisStateManager.leaveRoom(userId, conversationId);

      socket.to(conversationId).emit('user-left-conversation', {
        userId,
        userName: userProfile?.name,
        conversationId,
        message: `${userProfile?.name} left the conversation`
      });

      callback?.({ success: true, message: 'Left conversation successfully' });
    });


    //---------------------------------
    //   Handle fetching all conversations with pagination 🟢 working perfectly 
    //---------------------------------
    socket.on('get-all-conversations-with-pagination', async (conversationData: { page: number, limit: number }, callback) => {
      try {
        const conversations = await new ConversationParticipentsService().getAllConversationByUserIdWithPagination(userId, conversationData);
        callback?.({ success: true, data: conversations });
      } catch (error) {
        console.error('Error fetching conversations:', error);
        callback?.({ success: false, message: 'Failed to fetch conversations' });
      }
    })

    //---------------------------------
    //   get all message by conversationId with pagination 🟢 working perfectly 
    //---------------------------------
    socket.on('get-all-message-by-conversationId', async (conversationData: {
      conversationId: string,
      page: number,
      limit: number
    }, callback) => {

      let populateOptions = [
        {
          path: 'senderId',
          select: 'name profileImage'
        },
        {
          path: 'attachments',
          select: 'attachment profileImage'
        }
      ]

      try {
        const messages = await new MessagerService().getAllWithPagination(
          { conversationId: conversationData.conversationId, isDeleted: false }, // filters
          { page: conversationData.page, limit: conversationData.limit || Number.MAX_SAFE_INTEGER, sortBy: '-createdAt' }, // options
          populateOptions,
          '' // select
        );
        console.log("messages: 🟢🟢 ", messages);
        callback?.({ success: true, data: messages });
      } catch (error) {
        console.error('Error fetching conversations:', error);
        callback?.({ success: false, message: 'Failed to fetch conversations' });
      }
    })

    //---------------------------------
    //   Handle new messages  🟢working perfectly
    //---------------------------------

    socket.on('send-new-message', async (messageData: MessageData, callback) => {

      console.log("requested user Id 🟡🟡", userId)
      try {
        console.log('New message received:', messageData);

        if (!messageData.conversationId || !messageData.text?.trim()) {
          const error = 'Chat ID and message content are required';
          callback?.({ success: false, message: error });
          return emitError(socket, error);
        }

        // Get chat details
        const { conversationData, conversationParticipants } = await getConversationById(messageData.conversationId);

        // console.log('Conversation data:', conversationData);
        // console.log('Conversation participants:', conversationParticipants);

        //---------------------------------
        // here we will check if the sender is a participant in the conversation or not
        // if not then we will send an error message
        //---------------------------------
        let isExist = false;
        conversationParticipants.forEach((participant: any) => {
          const participantId = participant.userId?.toString();

          if (participantId == userId.toString()) {
            isExist = true;
            return;
          }
        });

        console.log("isExist: 🟡", isExist);

        if (!isExist) {
          emitError(socket, `You are not a participant in this conversation`);
        }

        // Create message
        const newMessage = await Message.create({
          ...messageData,
          timestamp: new Date(),
          senderId: userId,
        });

        //---------------------------------
        //  TODO : event emitter er maddhome message create korar por
        //  conversation er lastMessage update korte hobe ..
        //---------------------------------
        const updatedConversation = await Conversation.findByIdAndUpdate(messageData.conversationId, {
          lastMessage: newMessage._id,
        }); // .populate('lastMessage').exec()

        // Prepare message data for emission
        const messageToEmit = {
          ...messageData,
          _id: newMessage._id,
          senderId: userId, // senderId should be the userId
          name: userProfile?.name,
          image: userProfile?.profileImage,
          createdAt: newMessage.createdAt || new Date()
        };

        // Emit to chat room
        const eventName = `new-message-received::${messageData.conversationId}`; // ${messageData.conversationId}

        // when you send everyone exclude the sender
        socket.to(messageData.conversationId).emit(eventName, messageToEmit);

        // socket.emit(eventName, messageToEmit);

        //************************************************* */

        // 🟢 NEW: Notify all conversation participants about conversation list update

        // Notify each participant (except the sender if excludeUserId is provided)
        conversationParticipants.forEach(async (participant: any) => {
          const participantId = participant.userId?.toString();

          console.log(`1️⃣ .forEach Participant ID: ${participantId}, User ID: ${userId}`);

          const isOnline = await socketService.isUserOnline(participantId);

          // Check if participant is online
          //if (Array.from(onlineUsers).some(id => id.toString() === participantId)) {

          if (isOnline) {

            await socketService.emitToUser(
              participantId,
              `conversation-list-updated::${participantId}`,
              {
                creatorId: updatedConversation?.creatorId,
                type: updatedConversation?.type,
                siteId: updatedConversation?.siteId,
                canConversate: updatedConversation?.canConversate,
                lastMessage: {
                  _id: newMessage._id,
                  text: messageData.text,
                  senderId: userId,
                  conversationId: messageData.conversationId,
                },
                isDeleted: false,
                createdAt: "2025-07-19T12:06:00.287Z",
                _conversationId: updatedConversation?._id,
              }
            );

            /*********

            // Emit to participant's personal room  .to(participantId)
            io.emit(`conversation-list-updated::${participantId}`, {
              creatorId : updatedConversation?.creatorId,
              type: updatedConversation?.type,
              siteId: updatedConversation?.siteId,
              canConversate: updatedConversation?.canConversate,
              lastMessage: {
                _id: newMessage._id,
                text: messageData.text,
                senderId: userId,
                conversationId: messageData.conversationId,
              },
              isDeleted: false,
              createdAt: "2025-07-19T12:06:00.287Z",
              _conversationId: updatedConversation?._id,
            });

            ********** */

          } else {
            // TODO : MUST Push notification
            // .... TODO: push notification .. 
          }
        });

        //************************************************* */

        /// / Emit to sender's personal room 
        callback?.({
          success: true,
          message: "Message sent successfully",
          messageDetails: {
            messageId: newMessage._id,
            conversationId: messageData.conversationId,
            senderId: userId,
            text: messageData.text,
            timestamp: newMessage.createdAt || new Date(),
            name: userProfile?.name,
            image: userProfile?.profileImage || null

          },
        });

      } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage = 'Failed to send message';
        callback?.({ success: false, message: errorMessage });
        emitError(socket, errorMessage);
      }
    });


    // Add other event handlers here (send-new-message, get-all-conversations, etc.)
    // ... (your existing event handlers remain the same)

    // ────────────────────────────────────────────────────────────────────────
    // TASK MANAGEMENT EVENT HANDLERS (NEW)
    // For real-time task updates, collaboration, and progress tracking
    // ────────────────────────────────────────────────────────────────────────

    //---------------------------------
    // Join task room for real-time updates
    //---------------------------------
    socket.on('join-task', async (taskData: { taskId: string }, callback) => {
      if (!taskData.taskId) {
        return callback?.({ success: false, message: 'taskId is required' });
      }

      const taskId = taskData.taskId;

      logger.info(`📋 User ${userProfile.name} joining task room ${taskId}`);

      // Join socket.io room
      socket.join(taskId);

      // Update Redis state
      await this.redisStateManager.joinTaskRoom(userId, taskId);

      // Get task room users
      const roomUsers = await this.redisStateManager.getTaskRoomUsers(taskId);

      logger.info(`📋 Task room ${taskId} has ${roomUsers.length} users: ${roomUsers.join(', ')}`);

      // Notify others in the task
      socket.to(taskId).emit('user-joined-task', {
        userId,
        userName: userProfile?.name,
        taskId,
        isOnline: true,
      });

      callback?.({ success: true, message: 'Joined task room successfully' });
    });

    //---------------------------------
    // Leave task room
    //---------------------------------
    socket.on('leave-task', async (taskData: { taskId: string }, callback) => {
      if (!taskData.taskId) {
        return callback?.({ success: false, message: 'taskId is required' });
      }

      const taskId = taskData.taskId;

      // Leave socket.io room
      socket.leave(taskId);

      // Update Redis state
      await this.redisStateManager.leaveTaskRoom(userId, taskId);

      // Notify others
      socket.to(taskId).emit('user-left-task', {
        userId,
        userName: userProfile?.name,
        taskId,
      });

      callback?.({ success: true, message: 'Left task room successfully' });
    });

    // ────────────────────────────────────────────────────────────────────────
    // FAMILY/FAMILY ROOM EVENT HANDLERS (NEW)
    // Auto-joined based on childrenBusinessUser relationship
    // No manual join/leave - users are automatically part of their family
    // ────────────────────────────────────────────────────────────────────────

    //---------------------------------
    // Get live activity feed for family
    // Figma: dashboard-flow-01.png (Live Activity section)
    //---------------------------------
    socket.on('get-family-activity-feed', async (groupData: { businessUserId: string; limit?: number }, callback) => {
      if (!groupData.businessUserId) {
        return callback?.({ success: false, message: 'businessUserId is required' });
      }

      try {
        const limit = groupData.limit || 10;
        const activities = await this.redisStateManager.getActivityFeed(groupData.businessUserId, limit);

        callback?.({ success: true, data: activities });
      } catch (error) {
        logger.error('Error fetching activity feed:', error);
        callback?.({ success: false, message: 'Failed to fetch activity feed' });
      }
    });
  }

  // 🔗➡️ setupEventHandlers
  private async handleUserDisconnection(socket: Socket, userId: string) {
    logger.info(colors.red(`🔌🔴 User disconnected: ${userId} Socket ${socket.id}`));

    try {
      // Remove from Redis state
      await this.redisStateManager.removeOnlineUser(userId, socket.id);

      // Notify related users about offline status
      await this.notifyRelatedUsersOnlineStatus(userId, null, false);

    } catch (error) {
      logger.error('Error handling user disconnection:', error);
    }
  }

  // 🔗➡️ setupEventHandlers
  private async notifyRelatedUsersOnlineStatus(userId: string, userProfile: any, isOnline: boolean) {
    try {
      const relatedUsers = await this.redisStateManager.getRelatedOnlineUsers(userId);

      relatedUsers.forEach((relatedUserId: string) => {
        this.io!.emit(`related-user-online-status::${relatedUserId}`, {
          userId,
          isOnline,
          userName: userProfile?.name || '',
        });
      });

    } catch (error) {
      logger.error('Error notifying related users:', error);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Family Room Auto-Join Logic
  // Figma: dashboard-flow-01.png (Live Activity section)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Auto-join user to their family room based on childrenBusinessUser relationship
   * Called on user connection
   *
   * Logic:
   * 1. If user is a business user (parent/teacher) → join room with their businessUserId
   * 2. If user is a child → find their parent's businessUserId → join that room
   *
   * @param socket - Socket instance
   * @param userId - User ID
   * @param userProfile - User profile
   */
  private async autoJoinFamilyRoom(socket: Socket, userId: string, userProfile: IUserProfile): Promise<void> {
    try {
      // Import ChildrenBusinessUser model dynamically to avoid circular dependency
      const { ChildrenBusinessUser } = await import('../../modules/childrenBusinessUser.module/childrenBusinessUser.model');

      let familyRoomId: string | null = null;

      // Check if user is a child (has a parent business user)
      const childRelationship = await ChildrenBusinessUser.findOne({
        childUserId: new Types.ObjectId(userId),
        status: 'active',
        isDeleted: false,
      }).select('parentBusinessUserId');

      if (childRelationship) {
        // User is a child → join parent's family room
        familyRoomId = childRelationship.parentBusinessUserId.toString();
        logger.info(`👨‍👩‍👧‍👦 User ${userId} joined family room ${familyRoomId} (as child)`);
      } else {
        // Check if user is a business user (has children)
        const parentRelationship = await ChildrenBusinessUser.findOne({
          parentBusinessUserId: new Types.ObjectId(userId),
          status: 'active',
          isDeleted: false,
        }).select('parentBusinessUserId');

        if (parentRelationship) {
          // User is a business user → join their own family room
          familyRoomId = userId;
          logger.info(`👨‍👩‍👧‍👦 User ${userId} joined family room ${familyRoomId} (as business user)`);
        }
      }

      // Join family room if found
      if (familyRoomId) {
        socket.join(familyRoomId);
        await this.redisStateManager.joinGroupRoom(userId, familyRoomId);
      }

    } catch (error) {
      logger.error('Error auto-joining family room:', error);
      // Don't throw - family room join is optional
    }
  }

  private startCleanupJob() {
    // Clean up stale connections every 5 minutes
    setInterval(async () => {
      try {
        await this.redisStateManager.cleanupStaleConnections();
      } catch (error) {
        logger.error('Error in cleanup job:', error);
      }
    }, 5 * 60 * 1000);
  }

  // =============================================
  // Public API Methods
  // =============================================

  /*******
   * 🟢🟢 
   * This method helps us to send notification to any user based on his/her userId
   * we call this method into bullmq.ts -> startNotificationWorker
   * 🔗➡️  bullmq.ts -> startNotificationWorker
   * ********* */
  public async emitToUser(userId: string, event: string, data: INotification | any): Promise<boolean> {
    if (!this.io) return false;
    /*-------------------------
    const isOnline = await this.redisStateManager.isUserOnline(userId);
    if (isOnline) {
      this.io.to(userId).emit(event, data);
      return true;
    }else{
    ---------------------------*/
    // As Per Toky Vai .. we always send push notification .. 

    // send notification via firebase push notification

    console.log("Hit FCM TOKEN BLOCK ⚡")
    // Fetch user's FCM token from DB
    const user = await User.findById(userId, 'fcmToken');
    if (user?.fcmToken) {
      await sendPushNotification(
        user.fcmToken,
        data.title || 'You have a new notification',
        userId
      );
    }

    /*------------
  }
    ---------------------*/
    return false;
  }


  public async isUserInRoom(participantId: string, conversationId: string) {
    return await this.redisStateManager.isUserInRoom(participantId, conversationId);
  }

  /********
   * 🟢🟢
   * This method helps us to send notification to admin
   * 🔗➡️  bullmq.ts -> startNotificationWorker
   * ******* */
  // Add new method for role-based emission
  public emitToRole(role: string, event: string, data: INotification | any): boolean {
    if (!this.io) return false;
    this.io.to(`role::${role}`).emit(event, data);
    logger.info(`📢 Emitted to role: ${role}`);
    return true
  }

  public async emitToConversation(conversationId: string,
    event: string,
    data: any) {
    if (!this.io) return;
    this.io.to(conversationId).emit(event, data);
  }

  // ────────────────────────────────────────────────────────────────────────
  // TASK MANAGEMENT EMISSION METHODS (NEW)
  // For broadcasting task updates to all subscribed users
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Emit event to all users subscribed to a task
   * Used for real-time task updates (status change, edits, etc.)
   *
   * @param taskId - Task ID
   * @param event - Event name (e.g., 'task:updated', 'task:status-changed')
   * @param data - Event data
   * @returns true if emitted
   *
   * @example
   * socketService.emitToTask(
   *   taskId,
   *   'task:status-changed',
   *   { taskId, oldStatus: 'pending', newStatus: 'inProgress', changedBy: userId }
   * );
   */
  public async emitToTask(taskId: string, event: string, data: any): Promise<boolean> {
    if (!this.io) return false;

    // Emit to task room (all users subscribed to this task)
    this.io.to(taskId).emit(event, data);

    logger.info(`📋 Emitted ${event} to task ${taskId}`);
    return true;
  }

  /**
   * Emit task update to specific users (e.g., assignees, creator)
   *
   * @param userIds - Array of user IDs to notify
   * @param event - Event name
   * @param data - Event data
   * @returns true if emitted
   */
  public async emitToTaskUsers(userIds: string[], event: string, data: any): Promise<boolean> {
    if (!this.io) return false;

    for (const userId of userIds) {
      this.io.to(userId).emit(event, data);
    }

    logger.info(`📋 Emitted ${event} to ${userIds.length} task users`);
    return true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // GROUP/FAMILY MANAGEMENT EMISSION METHODS (NEW)
  // For broadcasting group activities via childrenBusinessUser module
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Emit event to all members of a group/family
   * Used for live activity feed, member changes, etc.
   *
   * @param groupId - Group ID (businessUserId for family groups)
   * @param event - Event name (e.g., 'group:activity', 'group:member-joined')
   * @param data - Event data
   * @returns true if emitted
   *
   * @example
   * socketService.emitToGroup(
   *   businessUserId,
   *   'group:activity',
   *   {
   *     type: 'task_completed',
   *     actor: { userId, name },
   *     task: { taskId, title },
   *     timestamp: new Date()
   *   }
   * );
   */
  public async emitToGroup(groupId: string, event: string, data: any): Promise<boolean> {
    if (!this.io) return false;

    // Emit to group room (all family/team members)
    this.io.to(groupId).emit(event, data);

    logger.info(`👨‍👩‍👧‍👦 Emitted ${event} to group ${groupId}`);
    return true;
  }

  /**
   * Add activity to group's activity feed and broadcast to all members
   * This is a convenience method that combines Redis storage + Socket emission
   *
   * @param groupId - Group ID
   * @param activity - Activity data
   * @param broadcast - Whether to broadcast to all members (default: true)
   *
   * @example
   * await socketService.broadcastGroupActivity(
   *   businessUserId,
   *   {
   *     type: 'task_created',
   *     actor: { userId: '123', name: 'John' },
   *     task: { taskId: 'abc', title: 'Homework' },
   *     timestamp: new Date()
   *   }
   * );
   */
  public async broadcastGroupActivity(
    groupId: string, // this is actually parentId .. actually i am not sure yet // 🔁
    activity: {
      type: string;
      actor: { userId: string; name: string; profileImage?: string };
      task?: { taskId: string; title: string };
      message?: string;
      timestamp: Date;
    },
    broadcast: boolean = true
  ): Promise<void> {
    // Add to Redis activity feed
    await this.redisStateManager.addActivityToFeed(groupId, activity);

    // Broadcast to all group members if enabled
    if (broadcast) {
      this.io.to(groupId).emit('group:activity', activity);
      logger.info(`📢 Broadcast activity to group ${groupId}`);
    }
  }

  /**
   * Get activity feed for a group
   *
   * @param groupId - Group ID
   * @param limit - Number of activities to return
   * @returns Array of activities
   */
  public async getGroupActivityFeed(groupId: string, limit: number = 10): Promise<any[]> {
    return await this.redisStateManager.getActivityFeed(groupId, limit);
  }

  // ────────────────────────────────────────────────────────────────────────
  // NOTIFICATION ENHANCEMENT METHODS (NEW)
  // For better real-time notification delivery
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Emit notification to user with automatic online/offline handling
   * If user is online → emit via Socket.IO
   * If user is offline → returns false (caller should send push notification)
   *
   * @param userId - User ID
   * @param event - Event name
   * @param data - Notification data
   * @returns true if emitted (user was online)
   */
  public async emitNotificationToUser(userId: string, event: string, data: any): Promise<boolean> {
    if (!this.io) return false;

    const isOnline = await this.isUserOnline(userId);

    if (isOnline) {
      this.io.to(userId).emit(event, data);
      logger.info(`🔔 Emitted notification to online user ${userId}`);
      return true;
    }

    logger.info(`📴 User ${userId} is offline, notification not emitted`);
    return false;
  }

  public emit(event: string, data: any) {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  public async getOnlineUsers(): Promise<string[]> {
    return await this.redisStateManager.getAllOnlineUsers();
  }

  public async isUserOnline(userId: string): Promise<boolean> {
    return await this.redisStateManager.isUserOnline(userId);
  }

  public async getUserConnectionInfo(userId: string) {
    return await this.redisStateManager.getUserConnectionInfo(userId);
  }

  public async getSystemStats() {
    return await this.redisStateManager.getSystemStats();
  }

  // 🟢🟢 Helper methods (same as before)
  private async getUserDetailsFromToken(token: string) {
    return await getUserDetailsFromToken(token);
  }


  // 🟢🟢
  private async getUserProfile(userId: string): Promise<IUserProfile | null> {
    return await User.findById(userId, 'id name email profileImage subscriptionType role fcmToken').lean();
  }

  private emitError(socket: Socket, message: string, disconnect = false) {
    socket.emit('error', { message });
    if (disconnect) socket.disconnect();
  }

  public close(): void {
    if (this.io) {
      logger.info(colors.yellow(`🔌 Closing Socket.IO in worker ${process.pid}...`));

      // Close all connections gracefully
      this.io.sockets.disconnectSockets(true);

      // Close the server
      this.io.close();

      this.io = null;
      this.isInitialized = false;

      logger.info(colors.green(`✅ Socket.IO closed in worker ${process.pid}`));
    }
  }
}

export const socketService = SocketService.getInstance();