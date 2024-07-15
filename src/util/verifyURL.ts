import validator from 'validator';

const verifyURL = (url: string) => {
  if (!url) return false;
  return validator.isURL(url, { require_protocol: true });
}

export default verifyURL;
