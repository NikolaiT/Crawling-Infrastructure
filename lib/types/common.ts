export enum ResultPolicy {
  return = 'return',
  store_in_cloud = 'store_in_cloud',
}

export enum ExecutionEnv {
  lambda = 'lambda',
  docker = 'docker',
  local = 'local',
}

export enum StoragePolicy {
  // stores each item with item._id as key and result value in a single s3 file
  itemwise = 'itemwise',
  // merges items with JSON.stringify() and stores as combined file of all results
  merged = 'merged',
}