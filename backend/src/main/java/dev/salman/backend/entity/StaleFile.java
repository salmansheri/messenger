package dev.salman.backend.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A stored file nothing refers to any more, waiting to be removed from storage. */
@Entity
@Table(name = "stale_file")
@Getter
@Setter
@NoArgsConstructor
public class StaleFile {

	@Id
	@Column(name = "storage_key")
	private String storageKey;

	@Column(nullable = false)
	private Instant since;

}
