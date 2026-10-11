import type { BookFormatChoice } from '@server/constants/media';
import { RemovalRequestStatus } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import Media from './Media';
import { User } from './User';

@Entity()
class RemovalRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int', default: RemovalRequestStatus.PENDING })
  @Index()
  public status: RemovalRequestStatus;

  @Column({ default: false })
  public is4k: boolean;

  // Books only: the formats to remove, null for other media
  @Column({ type: 'varchar', nullable: true })
  public bookFormat?: BookFormatChoice | null;

  @Column({ type: 'text', nullable: true })
  public reason?: string | null;

  @Column({ type: 'text', nullable: true })
  public declineReason?: string | null;

  @ManyToOne(() => Media, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @ManyToOne(() => User, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public requestedBy: User;

  @ManyToOne(() => User, {
    eager: true,
    onDelete: 'SET NULL',
    nullable: true,
  })
  public modifiedBy?: User | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<RemovalRequest>) {
    Object.assign(this, init);
  }
}

export default RemovalRequest;
