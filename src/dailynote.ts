import { TFile, moment, normalizePath } from "obsidian";
// import { WebDAVClient } from "webdav";
import Cloudr from "./main";

export class DailyNoteManager {
    constructor(private plugin: Cloudr) {
        this.plugin = plugin;
    }

    /**
     * Creates or updates a daily note, comparing local and remote content
     */
    async getDailyNote(filePath: string, remoteContent: string): Promise<TFile> {
        let finalContent = "";
        const template = ""; // Consider moving this to plugin settings

        // Check if file exists locally
        const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            const localContent = await this.plugin.app.vault.read(existingFile);

            // Use remote content if it's longer, otherwise keep local
            if (remoteContent && remoteContent.length > localContent.length) {
                finalContent = remoteContent;
                // Update existing file instead of creating new one
                await this.plugin.app.vault.modify(existingFile, finalContent);
                return existingFile;
            } else {
                return existingFile;
            }
        }

        // If file doesn't exist, use remote content or template
        finalContent = remoteContent || (await this.getTemplateContent(template));

        try {
            return await this.plugin.app.vault.create(filePath, finalContent);
        } catch (err) {
            console.error(`Failed to create daily note at '${filePath}':`, err);
            throw new Error(`Failed to create daily note: ${err.message}`);
        }
    }

    /**
     * Gets template content if specified
     */
    private async getTemplateContent(templatePath: string): Promise<string> {
        if (!templatePath) return "";

        const templateFile = this.plugin.app.vault.getAbstractFileByPath(templatePath);
        if (templateFile instanceof TFile) {
            return await this.plugin.app.vault.read(templateFile);
        }
        return "";
    }

    /**
     * Generates the daily note path based on format and folder
     */
    getDailyNotePath(folder: string, format: string) {
        const momentDate = moment();
        const formattedDate = momentDate.format(format);
        const folderPath = normalizePath(folder);
        const filePath = normalizePath(`${folderPath}/${formattedDate}.md`);

        return { filePath, folderPath };
    }

    /**
     * Fetches daily note content from WebDAV server
     */
    async getDailyNoteRemotely(dailyNotePath: string): Promise<string> {
        try {
            if (await this.plugin.webdavClient.exists(dailyNotePath)) {
                const response = await this.plugin.webdavClient.get(dailyNotePath);
                if (response.status === 200 && response.data) {
                    return new TextDecoder().decode(response.data);
                }
            }
        } catch (err) {
            console.error(`Failed to fetch remote note: ${err.message}`);
        }
        return "";
    }

    /**
     * Main function to create/sync daily note
     */
    async dailyNote() {
        try {
            // Consider moving these to plugin settings
            const folder = "Daily Notes";
            const format = "YYYY/YYYY-MM/YYYY-MM-DD ddd";

            const { filePath, folderPath } = this.getDailyNotePath(folder, format);

            // Ensure folder exists before proceeding
            await this.createFolderIfNotExists(folderPath);

            // Get remote content first
            const remoteContent = await this.getDailyNoteRemotely(filePath);

            // Create or update the note
            const dailyNote = await this.getDailyNote(filePath, remoteContent);

            // Open the note
            await this.plugin.app.workspace.getLeaf(false).openFile(dailyNote);
        } catch (err) {
            console.error("Failed to create/open daily note:", err);
            throw new Error(`Daily note operation failed: ${err.message}`);
        }
    }

    /**
     * Creates folder structure if it doesn't exist
     */
    private async createFolderIfNotExists(folderPath: string): Promise<void> {
        const folders = folderPath.split("/").filter((folder) => folder.length);
        let currentPath = "";

        for (const folder of folders) {
            currentPath += folder;
            if (!(await this.plugin.app.vault.adapter.exists(currentPath))) {
                await this.plugin.app.vault.createFolder(currentPath);
            }
            currentPath += "/";
        }
    }
}
