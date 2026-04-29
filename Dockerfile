FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY index.html .
COPY cecfo-worship_server.js .
COPY cecfo-worship_dashboard.html .
COPY cecfo-worship_tool.html .
EXPOSE 1314
CMD ["node", "cecfo-worship_server.js"]