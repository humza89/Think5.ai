export function pickAvatar(c: any): string {
  return c?.profilePhotoCdnUrl || c?.profileImage || "";
}

export function companyLogo(ex: any): string {
  return ex?.companyLogoCdnUrl
    || (ex?.company ? `https://logo.clearbit.com/${String(ex.company).replace(/\s+/g,"")}.com` : "");
}
