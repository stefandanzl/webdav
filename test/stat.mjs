import { createClient } from 'webdav';
const before = Date.now()
const client = createClient("https://cloudr.danzl.it/dav", {
    username: "stefan.danzl@live.de",
    password: "8xVCijoBe7FHgMgYStT9xx6FJHbLuO1T"
});
// const stat: FileStat = 
client.stat("/PROJECTS/OBSIDIAN/hirn/Favoriten.md", {details: true}).then((res) => {
    console.log(res);
    console.log(res.data.props?.checksum)

    const after = Date.now()

console.log("\nDuration: ",after - before)
});


