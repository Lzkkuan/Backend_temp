# Use nginx image to serve the build files
FROM nginx:1.27-alpine

# Add bash (optional, only if you really need it)
RUN apk add --no-cache bash

# Add nginx.conf and default.conf
COPY --chown=nginx:nginx nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx nginx/default.conf /etc/nginx/conf.d/default.conf

# (Remove templates + start.sh if not needed)

# Permissions
RUN chmod -R 755 /var/cache/nginx && chown -R nginx:nginx /var/cache/nginx && \
    chmod -R 755 /var/log/nginx && chown -R nginx:nginx /var/log/nginx && \
    chmod -R 755 /etc/nginx/conf.d && chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
