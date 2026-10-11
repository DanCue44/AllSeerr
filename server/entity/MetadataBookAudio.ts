import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Whether Audible lists an audiobook edition of an OpenLibrary work, so the
 * catalog is asked again only once the answer is stale
 */
@Entity()
class MetadataBookAudio {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ unique: true })
  public olId: string;

  // Audible marketplace the answer came from, such as us or uk
  @Column({ default: 'us' })
  public region: string;

  @Column()
  public hasAudiobook: boolean;

  @Column({ nullable: true, type: 'varchar' })
  public asin: string | null;

  // Narrators of the matched edition, null when they were never asked for
  @Column({ nullable: true, type: 'simple-json' })
  public narrators: string[] | null;

  @Column({ nullable: true, type: 'integer' })
  public runtimeMinutes: number | null;

  @Column({ nullable: true, type: 'varchar' })
  public coverUrl: string | null;

  @DbAwareColumn({ type: 'datetime' })
  public checkedAt: Date;

  @CreateDateColumn()
  public createdAt: Date;

  constructor(init?: Partial<MetadataBookAudio>) {
    Object.assign(this, init);
  }
}

export default MetadataBookAudio;
