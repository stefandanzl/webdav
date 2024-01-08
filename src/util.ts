

export const join = (...args: string[]) => {
    const separator = '/'; // Change this to '\\' for backslash on Windows
    return args.join(separator).replace(/\/\//g, '/');
  }
  
 export const emptyObj = (obj: unknown) => {
    if (typeof obj === 'object' && obj !== null){
        return Object.values(obj).length === 0
    } else {
        return true
    }
  }

export const extname = (filePath: string) => {

    // Check if the last character is '/'
    if (filePath.charAt(filePath.length - 1) === '/') {
        return '';
    }

    // Split the file path by '/' and take the last item
    const fileName = filePath.split('/').pop();
    
    if (!fileName){
        return "";
    }

    // Find the last dot in the file path
    const lastDotIndex = fileName.lastIndexOf('.');

    // If there is no dot or it's at the beginning of the file name, return an empty string
    if (lastDotIndex <= 0) {
        return '';
    }

    // Extract the extension by slicing the file path from the last dot index
    const extension = fileName.slice(lastDotIndex);

    return extension;
}