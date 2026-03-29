# Thunder Blessing Slot — Cocos Web Game (nginx static server)
# Build output from: CocosCreator --build "platform=web-desktop"

FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Cocos web-desktop build output
COPY web-desktop/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
