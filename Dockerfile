# Dockerfile

# Use an official Node.js runtime as a parent image (Choose a version >= 18)
FROM node:lts-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
# Doing this separately allows Docker to cache the npm install step if these files don't change
COPY package*.json ./

# Install app dependencies using npm ci for clean installs, or npm install
# RUN npm ci --only=production
RUN npm install --omit=dev # Install only production dependencies

# Bundle app source inside Docker image
COPY . .

# Define the command to run your app
CMD [ "node", "index.js" ] 