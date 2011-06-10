import urllib2
from xml.dom import minidom

GOOGLE_MERCHANT_ID = None # set this before using the module
GOOGLE_MERCHANT_HASH = None # same here

def get(node, childName):
    return node.getElementsByTagName(childName)[0]

def text(node, childName):
    """
    Return the text of the child node within node, or "" if it doesn't
    exist.
    """
    try:
        node = get(node, childName)
    except:
        return ""
    rc = []
    for child in node.childNodes:
        if child.nodeType == node.TEXT_NODE:
            rc.append(child.data)
    return ''.join(rc)

class GoogleOrderParser(object):

    @staticmethod
    def parse(orderid_list):
        """
        Return order data dictionaries for each order number in the array.
        Dicts contain id, date, item_number, email, name, amount.
        """

        url = "https://checkout.google.com/api/checkout/v2/reports/Merchant/%s"  % GOOGLE_MERCHANT_ID
        headers = {
            "Content-Type": "application/xml; charset=UTF-8",
            "Accept": "application/xml; charset=UTF8",
            "Authorization": "Basic %s" % GOOGLE_MERCHANT_HASH
            }
        template = '<google-order-number>%s</google-order-number>'
        order_xml = ''.join(template % oid for oid in orderid_list)
        data = """
          <notification-history-request xmlns="http://checkout.google.com/schema/2">
              <order-numbers>%s</order-numbers>
              <notification-types>
                  <notification-type>charge-amount</notification-type>
              </notification-types>
          </notification-history-request>
        """ % order_xml
        req = urllib2.Request(url, data, headers)
        dom = minidom.parseString(urllib2.urlopen(req).read())
        notifications = dom.getElementsByTagName('charge-amount-notification')
        return [ GoogleOrderParser.createOrderFrom(n) for n in notifications ]

    @staticmethod
    def createOrderFrom(cn):
        """cn: charge-amount-notification minidom node"""
        return {
            'id': text(cn, 'google-order-number'),
            'date': text(cn, 'purchase-date'),
            'tracking': text(cn, 'merchant-private-data'),
            'email': text(cn, 'email'),
            'name': text(cn, 'contact-name'),
            'amount': text(cn, 'latest-charge-amount'),
        }
