import { getRepository } from '@server/datasource';
import { OidcPayload } from '@server/entity/OidcPayload';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import { LessThan } from 'typeorm';

const epochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * Keeps the OpenID Connect provider's sessions, grants, codes and tokens in
 * Allseerr's database, so sign ins survive a restart
 */
export class OidcDatabaseAdapter implements Adapter {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  private toPayload(row: OidcPayload | null): AdapterPayload | undefined {
    if (!row) {
      return undefined;
    }

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return undefined;
    }

    const payload = JSON.parse(row.payload) as AdapterPayload;

    return row.consumedAt
      ? { ...payload, consumed: epochSeconds(row.consumedAt) }
      : payload;
  }

  public async upsert(
    id: string,
    payload: AdapterPayload,
    expiresIn?: number
  ): Promise<void> {
    await getRepository(OidcPayload).save(
      new OidcPayload({
        id,
        model: this.model,
        payload: JSON.stringify(payload),
        grantId: payload.grantId ?? null,
        uid: payload.uid ?? null,
        userCode: payload.userCode ?? null,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        consumedAt: null,
      })
    );
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(
      await getRepository(OidcPayload).findOne({
        where: { id, model: this.model },
      })
    );
  }

  public async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(
      await getRepository(OidcPayload).findOne({
        where: { uid, model: this.model },
      })
    );
  }

  public async findByUserCode(
    userCode: string
  ): Promise<AdapterPayload | undefined> {
    return this.toPayload(
      await getRepository(OidcPayload).findOne({
        where: { userCode, model: this.model },
      })
    );
  }

  public async consume(id: string): Promise<void> {
    await getRepository(OidcPayload).update(
      { id, model: this.model },
      { consumedAt: new Date() }
    );
  }

  public async destroy(id: string): Promise<void> {
    await getRepository(OidcPayload).delete({ id, model: this.model });
  }

  public async revokeByGrantId(grantId: string): Promise<void> {
    await getRepository(OidcPayload).delete({ grantId });
  }
}

/**
 * Removes what has expired, so the table does not grow forever
 */
export const cleanUpOidcPayloads = async (): Promise<void> => {
  await getRepository(OidcPayload).delete({ expiresAt: LessThan(new Date()) });
};
