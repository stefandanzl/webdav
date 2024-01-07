

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

  