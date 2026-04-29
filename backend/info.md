# run mongodb with docker
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest

MONGODB_URI=mongodb://admin:password@localhost:27017/mydatabase?authSource=admin