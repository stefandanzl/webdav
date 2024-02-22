import { WebDAVClient, FileStat, createClient } from 'webdav';


const client = createClient("https://cloudr.danzl.it/dav", {

    username: "stefan.danzl@live.de",
    password: "8xVCijoBe7FHgMgYStT9xx6FJHbLuO1T"
});

// const stat: FileStat = 
client.stat("/some/file.tar.gz").then((res)=>{
    console.log(res)
});

// console.log(stat)