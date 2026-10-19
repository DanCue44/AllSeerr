import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

/**
 * A key the NoBookEnds app signs in with, one for each phone or tablet a
 * user connects. Only the hash is kept, the key itself is shown once.
 */
@Entity('nobookends_device')
export class NoBookEndsDevice {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @Index()
  public user: User;

  @Index({ unique: true })
  @Column({ type: 'varchar', select: false })
  public keyHash: string;

  // The device the app said it runs on, such as "iPhone 16"
  @Column({ type: 'varchar', nullable: true })
  public label?: string | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public lastUsedAt?: Date | null;

  constructor(init?: Partial<NoBookEndsDevice>) {
    Object.assign(this, init);
  }
}
