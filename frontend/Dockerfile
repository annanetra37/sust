FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve

COPY --from=build /app/dist ./dist

# Inject runtime API URL into index.html
COPY <<'ENTRYPOINT' /app/start.sh
#!/bin/sh
if [ -n "$VITE_API_URL" ] && [ "$VITE_API_URL" != "/api" ]; then
  sed -i "s|</head>|<script>window.__API_URL__='${VITE_API_URL}';</script></head>|" /app/dist/index.html
fi
exec serve dist -s -l ${PORT:-3000}
ENTRYPOINT
RUN chmod +x /app/start.sh

EXPOSE ${PORT:-3000}
CMD ["/app/start.sh"]
