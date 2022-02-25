import * as assert from 'assert'
import { isValidDbusName } from '../../flatpakManifestUtils'

suite('flatpakManifestUtils', (): void => {
  test('isValidDbusName', () => {
    assert(
      isValidDbusName('_org.SomeApp'),
    )
    assert(
      isValidDbusName('com.org.SomeApp'),
    )
    assert(
      isValidDbusName('com.org_._SomeApp'),
    )
    assert(
      isValidDbusName('com.org-._SomeApp'),
    )
    assert(
      isValidDbusName('com.org._1SomeApp'),
    )
    assert(
      isValidDbusName('com.org._1_SomeApp'),
    )
    assert(
      isValidDbusName('VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.a111111111111'),
    )

    assert(
      !isValidDbusName('package'),
      'DBus name must contain at least two elements'
    )
    assert(
      !isValidDbusName('NoDot'),
      'DBus name must contain at least two elements'
    )
    assert(
      !isValidDbusName('No-dot'),
      'DBus name must contain at least two elements'
    )
    assert(
      !isValidDbusName('No_dot'),
      'DBus name must contain at least two elements'
    )
    assert(
      !isValidDbusName('Has.Two..Consecutive.Dots'),
      'DBus name elements must have at least one valid character'
    )
    assert(
      !isValidDbusName('HasThree...Consecutive.Dots'),
      'DBus name elements must have at least one valid character'
    )
    assert(
      !isValidDbusName('.StartsWith.A.Period'),
      'DBus name must not start with a period'
    )
    assert(
      !isValidDbusName('.'),
      'DBus name must not start with a period'
    )
    assert(
      !isValidDbusName('Ends.With.A.Period.'),
      'DBus name must not end with a period'
    )
    assert(
      !isValidDbusName('0P.Starts.With.A.Digit'),
      'DBus name must not start with a digit'
    )
    assert(
      !isValidDbusName('com.org.1SomeApp'),
      'DBus name element must not start with a digit'
    )
    assert(
      !isValidDbusName('Element.Starts.With.A.1Digit'),
      'DBus name element must not start with a digit'
    )
    assert(
      !isValidDbusName('VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.a1111111111112'),
      'DBus name must have less than or equal 255 characters'
    )
    assert(
      !isValidDbusName(''),
      'DBus name must not be empty'
    )
    assert(
      !isValidDbusName('contains.;nvalid.characters'),
      'The characters must only contain a-z, A-Z, periods, or underscores'
    )
    assert(
      !isValidDbusName('con\nins.invalid.characters'),
      'The characters must only contain a-z, A-Z, periods, or underscores'
    )
    assert(
      !isValidDbusName('con/ains.invalid.characters'),
      'The characters must only contain a-z, A-Z, periods, or underscores'
    )
    assert(
      !isValidDbusName('conta|ns.invalid.characters'),
      'The characters must only contain a-z, A-Z, periods, or underscores'
    )
    assert(
      !isValidDbusName('contæins.inva_å_lid.characters'),
      'The characters must only contain a-z, A-Z, periods, or underscores'
    )
  })
})
