# Docker Deployment Guide for Synology NAS

This guide explains how to deploy the Photo Upload Server to a Synology DS720+ (or any x86_64 Synology NAS) using Docker.

## Prerequisites

1. Synology NAS with DSM 7.2 or later
2. Docker package installed from Synology Package Center
3. SSH access enabled (optional but recommended)
4. AWS S3 bucket configured with appropriate permissions

## Method 1: Using Synology Docker UI (Recommended)

### Step 1: Prepare Files

1. Copy the entire `server` directory to your Synology NAS
2. Place it in a location like `/volume1/docker/photo-uploader/`

### Step 2: Build Docker Image

1. Open Docker package in Synology DSM
2. Go to "Image" tab
3. Click "Add" → "Add from file"
4. Navigate to your server directory and select the Dockerfile
5. The image will start building automatically
6. Name it something recognizable like `photo-uploader:latest`

### Step 3: Configure Container

1. Go to "Container" tab in Docker
2. Click "Create" → "Create Container"
3. Select the `photo-uploader` image
4. Configure the following:

#### General Settings
- Container name: `photo-uploader-server`
- Check "Enable auto-restart"

#### Port Settings
- Local port: `3000`
- Container port: `3000`
- Protocol: `TCP`

#### Volume Settings
- No volumes needed (everything goes to S3)

#### Environment Variables
Add the following environment variables:

```
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-southeast-1
S3_BUCKET=your_bucket_name
EXPECTED_API_KEY=your_secure_api_key
PORT=3000
NODE_ENV=production
```

#### Network Settings
- Use default bridge network

#### Health Check
- Command: `node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"`
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3
- Start period: 40 seconds

### Step 4: Start Container

1. Click "Next" and then "Apply" to create the container
2. Select the container and click "Start"
3. Check the logs to ensure it started successfully

## Method 2: Using SSH and Docker Compose

### Step 1: Enable SSH

1. Go to Control Panel → Terminal & SNMP
2. Check "Enable SSH service"
3. Note the port (default 22)

### Step 2: Connect via SSH

```bash
ssh admin@your-nas-ip
```

### Step 3: Install Docker Compose (if not installed)

```bash
sudo -i
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### Step 4: Deploy

```bash
cd /volume1/docker/photo-uploader
docker-compose up -d
```

## Method 3: Using Portainer (Advanced)

If you have Portainer installed on your Synology:

1. Open Portainer web interface
2. Go to "Stacks"
3. Click "Add stack"
4. Name it `photo-uploader`
5. Paste the contents of `docker-compose.yml`
6. Set environment variables in the web UI
7. Click "Deploy the stack"

## Verification

After deployment:

1. Check if the container is running:
   ```bash
   docker ps
   ```

2. Check the health status:
   ```bash
   docker inspect photo-uploader-server | grep Health -A 10
   ```

3. Test the health endpoint:
   ```bash
   curl http://localhost:3000/api/health?api_key=your_api_key
   ```

4. Access the photo gallery:
   ```
   http://your-nas-ip:3000/your-event-code/photos
   ```

## Monitoring

### View Logs

Via Synology Docker UI:
1. Select the container
2. Click "Details"
3. Go to "Log" tab

Via SSH:
```bash
docker logs -f photo-uploader-server
```

### Health Monitoring

The container includes a built-in health check that:
- Runs every 30 seconds
- Checks the `/api/health` endpoint
- Marks the container as unhealthy if the check fails 3 times

## Troubleshooting

### Common Issues

1. **Container won't start**
   - Check environment variables are correctly set
   - Verify AWS credentials have proper S3 permissions
   - Check Docker logs for error messages

2. **Image processing errors**
   - The Dockerfile includes all necessary dependencies for Sharp
   - If issues persist, try rebuilding the image

3. **Port conflicts**
   - Ensure port 3000 is not used by another service
   - Change the port mapping if needed

4. **Memory issues**
   - The DS720+ has 2GB RAM, which should be sufficient
   - Monitor memory usage in Synology Resource Monitor

### Getting Help

1. Check container logs for specific error messages
2. Verify all environment variables are set correctly
3. Test AWS S3 connectivity separately
4. Check Synology's system logs for Docker-related issues

## Security Considerations

1. Use a strong API key for `EXPECTED_API_KEY`
2. Ensure AWS credentials have minimal required permissions
3. Consider using HTTPS reverse proxy (Synology can do this)
4. Regularly update the container image for security patches

## Backup and Recovery

Since all data goes to S3:
1. Container can be recreated without data loss
2. Backup your environment variables
3. Document your S3 bucket configuration

## Performance Optimization

1. The DS720+ has a Celeron J4125 processor, adequate for this workload
2. Consider enabling SSD cache if you have one
3. Monitor CPU usage during peak upload times
4. The container is optimized for minimal resource usage

## Updates

To update the application:

1. Pull latest code
2. Rebuild Docker image
3. Stop and recreate container with same settings
4. Or use docker-compose: `docker-compose pull && docker-compose up -d`