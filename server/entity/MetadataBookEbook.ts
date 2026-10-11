import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Whether Google Books lists an ebook edition of an OpenLibrary work, so the
 * API is asked again only once the answer is stale
 */
@Entity()
class MetadataBookEbook {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ unique: true })
  public olId: string;

  // Country the answer came from, such as US or GB
  @Column({ default: 'US' })
  public region: string;

  // Null when Google Books has no volume of the book at all
  @Column({ nullable: true, type: 'boolean' })
  public hasEbook: boolean | null;

  // Google Books volume the answer is based on
  @Column({ nullable: true, type: 'varchar' })
  public volumeId: string | null;

  @DbAwareColumn({ type: 'datetime' })
  public checkedAt: Date;

  @CreateDateColumn()
  public createdAt: Date;

  constructor(init?: Partial<MetadataBookEbook>) {
    Object.assign(this, init);
  }
}

export default MetadataBookEbook;
