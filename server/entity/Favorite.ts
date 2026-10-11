import type { MediaType } from '@server/constants/media';
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

@Entity()
@Unique('UNIQUE_USER_FAVORITE', ['user', 'tmdbId', 'mediaType'])
@Unique('UNIQUE_USER_FAVORITE_MBID', ['user', 'mbId', 'mediaType'])
@Unique('UNIQUE_USER_FAVORITE_OLID', ['user', 'olId', 'mediaType'])
class Favorite {
  @PrimaryGeneratedColumn()
  public id: number;

  // Albums and books have no TMDB id, they are keyed on mbId and olId
  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public mbId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public olId?: string | null;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @Index()
  public user: User;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<Favorite>) {
    Object.assign(this, init);
  }
}

export default Favorite;
