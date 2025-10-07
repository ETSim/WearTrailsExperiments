// PhysicsManager - Handles Ammo.js physics world setup and configuration
export class PhysicsManager {
  constructor() {
    this.A = null;
    this.world = null;
    this.dispatcher = null;
    this.collisionConfig = null;
    this.broadphase = null;
    this.solver = null;
    this.softBodySolver = null;
  }

  // Initialize physics world
  async init() {
    // Initialize Ammo.js
    this.A = await Ammo();
    
    // Use soft body collision configuration for soft body support
    this.collisionConfig = new this.A.btSoftBodyRigidBodyCollisionConfiguration();
    this.dispatcher = new this.A.btCollisionDispatcher(this.collisionConfig);
    this.broadphase = new this.A.btDbvtBroadphase();
    this.solver = new this.A.btSequentialImpulseConstraintSolver();
    this.softBodySolver = new this.A.btDefaultSoftBodySolver();
    
    this.world = new this.A.btSoftRigidDynamicsWorld(
      this.dispatcher, 
      this.broadphase, 
      this.solver, 
      this.collisionConfig, 
      this.softBodySolver
    );
    
    // Set initial gravity
    this.world.setGravity(new this.A.btVector3(0, -9.81, 0));
    this.world.getWorldInfo().set_m_gravity(new this.A.btVector3(0, -9.81, 0));

    return {
      A: this.A,
      world: this.world,
      dispatcher: this.dispatcher
    };
  }

  // Set gravity
  setGravity(gravity) {
    this.world.setGravity(new this.A.btVector3(0, -gravity, 0));
    this.world.getWorldInfo().set_m_gravity(new this.A.btVector3(0, -gravity, 0));
  }

  // Set physics timestep parameters
  setTimestep(timestepHz, maxSubsteps, fixedTimestep) {
    this.world.setFixedTimeStep(1 / fixedTimestep);
    this.world.setMaxSubSteps(maxSubsteps);
  }

  // Step physics simulation
  stepSimulation(deltaTime, maxSubsteps, fixedTimestep) {
    this.world.stepSimulation(deltaTime, maxSubsteps, fixedTimestep);
  }

  // Add rigid body to world
  addRigidBody(body) {
    this.world.addRigidBody(body);
  }

  // Remove rigid body from world
  removeRigidBody(body) {
    this.world.removeRigidBody(body);
  }

  // Add soft body to world
  addSoftBody(body) {
    this.world.addSoftBody(body);
  }

  // Remove soft body from world
  removeSoftBody(body) {
    this.world.removeSoftBody(body);
  }

  // Get world reference
  getWorld() {
    return this.world;
  }

  // Get Ammo.js reference
  getAmmo() {
    return this.A;
  }

  // Get dispatcher reference
  getDispatcher() {
    return this.dispatcher;
  }

  // Cleanup method
  dispose() {
    // Ammo.js cleanup is handled automatically
    this.A = null;
    this.world = null;
    this.dispatcher = null;
    this.collisionConfig = null;
    this.broadphase = null;
    this.solver = null;
    this.softBodySolver = null;
  }
}
