/** The synchronous host names unavailable content; the enclosing fold resolves exactly that request. */
export class ContentNeeded extends Error {
  readonly digest: string;
  constructor(digest: string, why = `REFUSE·pin ${digest} content unavailable · not laid`) {
    super(why);
    this.digest = digest;
    this.name = 'ContentNeeded';
  }
}
