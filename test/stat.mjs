import { createClient } from 'webdav';
import { createHash } from 'crypto';
import {createHash as uintCreateHash} from "sha1-uint8array";

function sha1(data){
    const a = false
    if (a){
        // return CryptoJS.SHA1(data).toString(CryptoJS.enc.Hex);
        return uintCreateHash().update(data).digest("hex");
    } else {
        return createHash('sha1').update(data).digest('hex');
    }   


}

async function work(){
const before = Date.now()
const client = createClient("https://cloudr.danzl.it/dav", {
    username: "stefan.danzl@live.de",
    password: "8xVCijoBe7FHgMgYStT9xx6FJHbLuO1T"
});
// const stat: FileStat = 

const remoteFilePath = "/PROJECTS/OBSIDIAN/hirn/PROJEKTE/PROGRAMMIEREN/Obsidian/obsidian-cloudr/Issues.md"
const res = await client.stat(remoteFilePath, {details: true})
// .then((res) => {
    console.log(res);
    console.log(res.data.props?.checksum)

    const after = Date.now()


    const remoteContent = await client.getFileContents(remoteFilePath, { format: "text" });

    console.log("\nCNTTEMNE",remoteContent)

    console.log(sha1(remoteContent))

console.log("\nDuration: ",after - before)
// });
}


work()