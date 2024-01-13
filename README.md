# Webdav

## Reliable and quick way to keep your vault in sync on all your devices

This plugin makes use of comparing file checksums between Obsidian vault and a WebDav and file server.
Only a few WebDav Servers support checksum metadata.
Furthermore, it is required to set CORS Allow Origin Header to "*", which may not be possible on many systems.


## Settings

#### WebDav URL
#### Webdav Username
#### Webdav Password
#### Test Connection
#### Webdav Base Directory
#### Override remote Vault Name
#### Excluded Directories
#### Excluded file extensions
#### Excluded filename markers
#### PULL start
#### Live Sync
#### Auto Sync
#### Auto Sync fixed Interval
#### Enable Ribbons



####CORS

```
add_header 'Access-Control-Allow-Origin' "*" always;
add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With,Depth' always;
add_header 'Access-Control-Allow-Methods' 'GET,POST,PUT,PATCH,DELETE,OPTIONS,PROPFIND,PROPPATCH,MKCOL,COPY,MOVE' always;
```