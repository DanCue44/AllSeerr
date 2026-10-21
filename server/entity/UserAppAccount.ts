import type { UserAccessApp } from '@server/constants/userAccess';
import { UserAppAccountStatus } from '@server/constants/userAccess';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './User';

/**
 * A person's access to an app Allseerr manages accounts in, such as
 * Audiobookshelf, Kavita or Komga, and the account it made there
 */
@Entity('user_app_account')
@Unique('UQ_user_app_account_user_app', ['user', 'app'])
export class UserAppAccount {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @Index()
  public user: User;

  @Column({ type: 'varchar' })
  public app: UserAccessApp;

  // Whether the person may use the app
  @Column({ type: 'boolean', default: false })
  public enabled: boolean;

  // Libraries in the app the person may open, null for all of them
  @Column({ type: 'simple-json', nullable: true })
  public libraryIds?: string[] | null;

  // The account in the app, once Allseerr has made or found it
  @Column({ type: 'varchar', nullable: true })
  public remoteUserId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public remoteUsername?: string | null;

  @Column({ type: 'varchar', default: UserAppAccountStatus.NONE })
  public status: UserAppAccountStatus;

  @Column({ type: 'text', nullable: true })
  public lastError?: string | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public syncedAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<UserAppAccount>) {
    Object.assign(this, init);
  }
}
