import Cloudr from "./main";
import { requestUrl } from "obsidian";



// function createFullUrl(path: string): string {
//     const cleanPath = path.startsWith('/') ? path : `/${path}`;
//     return `${this.baseUrl}${cleanPath}`;
// }

// function createAuthHeader(username:string, password: string): string {
//     return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
// }

export async function testFuncOne(plugin: Cloudr) {

    

    // const exists = await plugin.webdavClient.exists(plugin.baseWebdav );
    // console.log("EXISTS",exists)

    const path = "https://webhook.site/6d4dba44-1f07-4e6f-86b8-9e73e9fd0949/test Puut.txt"

 const response = await requestUrl({
            url:  path,
            method: 'PUT',
            headers: {
                'Authorization': "Basic YWRtaW5AY2xvdWRyLm9yZzpicERDbnprUFhScU5Qb2IzWU15bTVZdm5JS09Cc1RPVw==",
                'Content-Type': "text/plain" ,//content instanceof ArrayBuffer ? 'application/octet-stream' : 'text/plain',
                // 'Translate': 'f'  // Tell WebDAV not to do URL translation
            },
            body: "HEEEEEEEEE"
        });
        
        console.log(response) 







}